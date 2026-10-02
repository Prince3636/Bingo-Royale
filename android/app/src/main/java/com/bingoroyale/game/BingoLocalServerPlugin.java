package com.bingoroyale.game;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "BingoLocalServer")
public class BingoLocalServerPlugin extends Plugin {
    private static final String TAG = "BingoLocalServer";
    private static final int DEFAULT_WS_PORT = 8765;
    private static final int DISCOVERY_PORT = 8766;

    private LocalWebSocketServer wsServer;
    private final Map<String, WebSocket> clientMap = new ConcurrentHashMap<>();
    private final Map<WebSocket, String> socketToIdMap = new ConcurrentHashMap<>();

    private Thread beaconThread;
    private Thread discoveryThread;
    private volatile boolean isBeaconRunning = false;
    private volatile boolean isDiscoveryRunning = false;
    private DatagramSocket beaconSocket;
    private DatagramSocket discoverySocket;
    private WifiManager.MulticastLock multicastLock;

    private String currentRoomCode = "LOCAL1";
    private String currentHostName = "Host";
    private int currentPlayers = 1;
    private int maxPlayers = 5;

    @Override
    public void load() {
        super.load();
        try {
            WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi != null) {
                multicastLock = wifi.createMulticastLock("BingoMulticastLock");
                multicastLock.setReferenceCounted(true);
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not initialize MulticastLock: " + e.getMessage());
        }
    }

    private void acquireMulticastLock() {
        try {
            if (multicastLock != null && !multicastLock.isHeld()) {
                multicastLock.acquire();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error acquiring MulticastLock: " + e.getMessage());
        }
    }

    private void releaseMulticastLock() {
        try {
            if (multicastLock != null && multicastLock.isHeld()) {
                multicastLock.release();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error releasing MulticastLock: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getLocalIp(PluginCall call) {
        String ip = findLocalIpAddress();
        boolean isHotspot = isHotspotIp(ip);
        JSObject ret = new JSObject();
        ret.put("ip", ip);
        ret.put("isHotspot", isHotspot);
        call.resolve(ret);
    }

    @PluginMethod
    public void startServer(PluginCall call) {
        int port = call.getInt("port", DEFAULT_WS_PORT);
        currentRoomCode = call.getString("roomCode", "LOCAL1");
        currentHostName = call.getString("hostName", "Host");
        currentPlayers = call.getInt("players", 1);
        maxPlayers = call.getInt("maxPlayers", 5);

        stopServerInternal();

        try {
            String localIp = findLocalIpAddress();
            wsServer = new LocalWebSocketServer(new InetSocketAddress("0.0.0.0", port));
            wsServer.setReuseAddr(true);
            wsServer.setTcpNoDelay(true);
            wsServer.start();

            startHostBeacon(localIp, port);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("ip", localIp);
            ret.put("port", port);
            ret.put("roomCode", currentRoomCode);
            call.resolve(ret);
            Log.i(TAG, "Local server started on 0.0.0.0:" + port + ", IP: " + localIp);
        } catch (Exception e) {
            Log.error(TAG, "Failed to start local server", e);
            call.reject("Failed to start local server: " + e.getMessage());
        }
    }

    @PluginMethod
    public void updateServerState(PluginCall call) {
        if (call.hasOption("players")) {
            currentPlayers = call.getInt("players", currentPlayers);
        }
        if (call.hasOption("maxPlayers")) {
            maxPlayers = call.getInt("maxPlayers", maxPlayers);
        }
        if (call.hasOption("roomCode")) {
            currentRoomCode = call.getString("roomCode", currentRoomCode);
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        stopServerInternal();
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    private synchronized void stopServerInternal() {
        stopHostBeacon();
        if (wsServer != null) {
            try {
                wsServer.stop(1000);
            } catch (Exception e) {
                Log.w(TAG, "Error stopping wsServer: " + e.getMessage());
            }
            wsServer = null;
        }
        clientMap.clear();
        socketToIdMap.clear();
    }

    @PluginMethod
    public void broadcast(PluginCall call) {
        String message = call.getString("message");
        if (message == null) {
            call.reject("Message is required");
            return;
        }

        if (wsServer != null) {
            wsServer.broadcast(message);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } else {
            call.reject("Server is not running");
        }
    }

    @PluginMethod
    public void sendToClient(PluginCall call) {
        String clientId = call.getString("clientId");
        String message = call.getString("message");
        if (clientId == null || message == null) {
            call.reject("clientId and message are required");
            return;
        }

        WebSocket socket = clientMap.get(clientId);
        if (socket != null && socket.isOpen()) {
            socket.send(message);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } else {
            call.reject("Client socket not found or closed: " + clientId);
        }
    }

    @PluginMethod
    public void disconnectClient(PluginCall call) {
        String clientId = call.getString("clientId");
        if (clientId != null) {
            WebSocket socket = clientMap.remove(clientId);
            if (socket != null) {
                socketToIdMap.remove(socket);
                try {
                    socket.close();
                } catch (Exception ignored) {}
            }
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    // ==========================================
    // UDP LOCAL LAN DISCOVERY
    // ==========================================

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        stopDiscoveryInternal();
        acquireMulticastLock();
        isDiscoveryRunning = true;

        discoveryThread = new Thread(() -> {
            try {
                discoverySocket = new DatagramSocket(null);
                discoverySocket.setReuseAddress(true);
                discoverySocket.setBroadcast(true);
                discoverySocket.bind(new InetSocketAddress("0.0.0.0", DISCOVERY_PORT));

                sendDiscoveryPing();

                byte[] buf = new byte[1024];
                while (isDiscoveryRunning) {
                    try {
                        DatagramPacket packet = new DatagramPacket(buf, buf.length);
                        discoverySocket.receive(packet);
                        String msg = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8).trim();

                        if (msg.startsWith("BINGO_ANNOUNCE:")) {
                            String jsonStr = msg.substring("BINGO_ANNOUNCE:".length());
                            JSObject hostData = new JSObject(jsonStr);
                            // Fallback to sender address if IP is empty or loopback
                            String announcedIp = hostData.getString("ip", "");
                            if (announcedIp.isEmpty() || announcedIp.equals("127.0.0.1")) {
                                hostData.put("ip", packet.getAddress().getHostAddress());
                            }
                            notifyListeners("hostDiscovered", hostData);
                        }
                    } catch (SocketException se) {
                        break;
                    } catch (Exception e) {
                        Log.w(TAG, "Error in discovery receive: " + e.getMessage());
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Discovery socket error: " + e.getMessage());
            } finally {
                if (discoverySocket != null && !discoverySocket.isClosed()) {
                    discoverySocket.close();
                }
                releaseMulticastLock();
            }
        }, "BingoDiscoveryThread");
        discoveryThread.start();

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    private void sendDiscoveryPing() {
        new Thread(() -> {
            try {
                DatagramSocket pingSock = new DatagramSocket();
                pingSock.setBroadcast(true);
                byte[] pingData = "BINGO_PING".getBytes(StandardCharsets.UTF_8);

                // Broadcast to standard broadcast and hotspot subnet addresses
                InetAddress broadcastAddr = InetAddress.getByName("255.255.255.255");
                DatagramPacket pingPacket = new DatagramPacket(pingData, pingData.length, broadcastAddr, DISCOVERY_PORT);
                pingSock.send(pingPacket);

                // Also ping standard Android hotspot gateway 192.168.43.1 directly
                try {
                    InetAddress hotspotGateway = InetAddress.getByName("192.168.43.1");
                    DatagramPacket directPacket = new DatagramPacket(pingData, pingData.length, hotspotGateway, DISCOVERY_PORT);
                    pingSock.send(directPacket);
                } catch (Exception ignored) {}

                pingSock.close();
            } catch (Exception e) {
                Log.w(TAG, "Error sending discovery ping: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        stopDiscoveryInternal();
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    private synchronized void stopDiscoveryInternal() {
        isDiscoveryRunning = false;
        if (discoverySocket != null && !discoverySocket.isClosed()) {
            discoverySocket.close();
            discoverySocket = null;
        }
        if (discoveryThread != null) {
            discoveryThread.interrupt();
            discoveryThread = null;
        }
        releaseMulticastLock();
    }

    private void startHostBeacon(String localIp, int wsPort) {
        stopHostBeacon();
        acquireMulticastLock();
        isBeaconRunning = true;

        beaconThread = new Thread(() -> {
            try {
                beaconSocket = new DatagramSocket(null);
                beaconSocket.setReuseAddress(true);
                beaconSocket.setBroadcast(true);
                beaconSocket.bind(new InetSocketAddress("0.0.0.0", DISCOVERY_PORT));

                while (isBeaconRunning) {
                    try {
                        String payload = String.format(
                                "{\"roomCode\":\"%s\",\"hostName\":\"%s\",\"ip\":\"%s\",\"port\":%d,\"players\":%d,\"maxPlayers\":%d}",
                                currentRoomCode, currentHostName, localIp, wsPort, currentPlayers, maxPlayers
                        );
                        String announce = "BINGO_ANNOUNCE:" + payload;
                        byte[] data = announce.getBytes(StandardCharsets.UTF_8);

                        // Broadcast packet
                        DatagramPacket packet = new DatagramPacket(data, data.length, InetAddress.getByName("255.255.255.255"), DISCOVERY_PORT);
                        beaconSocket.send(packet);

                        // Wait for ping or sleep 1.5 seconds
                        beaconSocket.setSoTimeout(1500);
                        byte[] recvBuf = new byte[256];
                        DatagramPacket incoming = new DatagramPacket(recvBuf, recvBuf.length);
                        try {
                            beaconSocket.receive(incoming);
                            String req = new String(incoming.getData(), 0, incoming.getLength(), StandardCharsets.UTF_8).trim();
                            if (req.equals("BINGO_PING")) {
                                DatagramPacket reply = new DatagramPacket(data, data.length, incoming.getAddress(), incoming.getPort());
                                beaconSocket.send(reply);
                            }
                        } catch (java.net.SocketTimeoutException ignored) {}
                    } catch (SocketException se) {
                        break;
                    } catch (Exception e) {
                        Log.w(TAG, "Beacon loop error: " + e.getMessage());
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Beacon socket failed: " + e.getMessage());
            } finally {
                if (beaconSocket != null && !beaconSocket.isClosed()) {
                    beaconSocket.close();
                }
                releaseMulticastLock();
            }
        }, "BingoBeaconThread");
        beaconThread.start();
    }

    private synchronized void stopHostBeacon() {
        isBeaconRunning = false;
        if (beaconSocket != null && !beaconSocket.isClosed()) {
            beaconSocket.close();
            beaconSocket = null;
        }
        if (beaconThread != null) {
            beaconThread.interrupt();
            beaconThread = null;
        }
        releaseMulticastLock();
    }

    // ==========================================
    // IP ADDRESS RESOLUTION
    // ==========================================

    private String findLocalIpAddress() {
        String fallbackIp = "127.0.0.1";
        try {
            List<NetworkInterface> interfaces = Collections.list(NetworkInterface.getNetworkInterfaces());
            // 1. First priority: hotspot and wlan interfaces
            for (NetworkInterface intf : interfaces) {
                if (intf.isLoopback() || !intf.isUp()) continue;
                String name = intf.getName().toLowerCase();
                if (name.contains("wlan") || name.contains("ap") || name.contains("rndis") || name.contains("swlan")) {
                    Enumeration<InetAddress> addrs = intf.getInetAddresses();
                    while (addrs.hasMoreElements()) {
                        InetAddress addr = addrs.nextElement();
                        if (!addr.isLoopbackAddress() && addr.getAddress().length == 4) {
                            return addr.getHostAddress();
                        }
                    }
                }
            }
            // 2. Second priority: any non-loopback IPv4 address
            for (NetworkInterface intf : interfaces) {
                if (intf.isLoopback() || !intf.isUp()) continue;
                Enumeration<InetAddress> addrs = intf.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress addr = addrs.nextElement();
                    if (!addr.isLoopbackAddress() && addr.getAddress().length == 4) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Error finding local IP: " + e.getMessage());
        }
        return fallbackIp;
    }

    private boolean isHotspotIp(String ip) {
        return ip.startsWith("192.168.43.") || ip.startsWith("192.168.44.") || ip.startsWith("10.0.");
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        stopServerInternal();
        stopDiscoveryInternal();
    }

    // ==========================================
    // WEBSOCKET SERVER IMPLEMENTATION
    // ==========================================

    private class LocalWebSocketServer extends WebSocketServer {
        public LocalWebSocketServer(InetSocketAddress address) {
            super(address);
        }

        @Override
        public void onOpen(WebSocket conn, ClientHandshake handshake) {
            String clientId = "c_" + UUID.randomUUID().toString().substring(0, 8);
            clientMap.put(clientId, conn);
            socketToIdMap.put(conn, clientId);

            JSObject data = new JSObject();
            data.put("clientId", clientId);
            data.put("ip", conn.getRemoteSocketAddress().getAddress().getHostAddress());
            notifyListeners("clientConnected", data);
            Log.i(TAG, "Client connected: " + clientId + " from " + conn.getRemoteSocketAddress());
        }

        @Override
        public void onClose(WebSocket conn, int code, String reason, boolean remote) {
            String clientId = socketToIdMap.remove(conn);
            if (clientId != null) {
                clientMap.remove(clientId);
                JSObject data = new JSObject();
                data.put("clientId", clientId);
                data.put("code", code);
                data.put("reason", reason);
                notifyListeners("clientDisconnected", data);
                Log.i(TAG, "Client disconnected: " + clientId + " (code: " + code + ")");
            }
        }

        @Override
        public void onMessage(WebSocket conn, String message) {
            String clientId = socketToIdMap.get(conn);
            if (clientId != null) {
                JSObject data = new JSObject();
                data.put("clientId", clientId);
                data.put("message", message);
                notifyListeners("clientMessage", data);
            }
        }

        @Override
        public void onError(WebSocket conn, Exception ex) {
            Log.w(TAG, "WebSocket error: " + ex.getMessage());
        }

        @Override
        public void onStart() {
            Log.i(TAG, "WebSocketServer started successfully on port " + getPort());
        }
    }
}
