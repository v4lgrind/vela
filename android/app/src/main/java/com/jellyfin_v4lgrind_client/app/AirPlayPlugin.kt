package com.jellyfin_v4lgrind_client.app

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.net.Inet4Address

private const val TAG = "AirPlayPlugin"
private const val SERVICE_TYPE = "_airplay._tcp."

/**
 * AirPlay output for music: finds receivers on the network (mDNS), pairs Apple
 * TVs with their on-screen PIN and starts / stops [AirPlayManager] sessions.
 */
@CapacitorPlugin(name = "AirPlay")
class AirPlayPlugin : Plugin(), AirPlayManager.Listener {

    private val mainHandler = Handler(Looper.getMainLooper())
    private val nsd by lazy { context.getSystemService(Context.NSD_SERVICE) as NsdManager }
    private val devices = linkedMapOf<String, AirPlayManager.Device>()
    private val pendingResolves = ArrayDeque<NsdServiceInfo>()
    private var resolving = false
    private var discoveryListener: NsdManager.DiscoveryListener? = null

    override fun load() {
        AirPlayManager.listener = this
    }

    override fun handleOnDestroy() {
        stopDiscoveryInternal()
        if (AirPlayManager.listener === this) AirPlayManager.listener = null
    }

    override fun onStateChanged(state: String, device: AirPlayManager.Device?, error: String?) {
        notifyListeners(
            "stateChange",
            JSObject().put("state", state).put("deviceName", device?.name).put("error", error),
        )
    }

    @PluginMethod
    fun isSupported(call: PluginCall) {
        call.resolve(JSObject().put("supported", AirPlayManager.isSupported(context)))
    }

    @PluginMethod
    fun getState(call: PluginCall) = mainHandler.post {
        val device = AirPlayManager.currentDevice()
        call.resolve(JSObject().put("connected", device != null).put("deviceName", device?.name))
    }

    /** Starts browsing; found receivers arrive as `devicesChanged` events. */
    @PluginMethod
    fun startDiscovery(call: PluginCall) = mainHandler.post {
        if (discoveryListener == null) {
            val listener = object : NsdManager.DiscoveryListener {
                override fun onServiceFound(info: NsdServiceInfo) = mainHandler.post { enqueueResolve(info) }.let {}
                override fun onServiceLost(info: NsdServiceInfo) = mainHandler.post {
                    devices.values.removeAll { it.name == info.serviceName }
                    emitDevices()
                }.let {}
                override fun onDiscoveryStarted(serviceType: String) {}
                override fun onDiscoveryStopped(serviceType: String) {}
                override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                    Log.w(TAG, "Discovery failed: $errorCode")
                }
                override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
            }
            discoveryListener = listener
            nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
        }
        emitDevices()
        call.resolve()
    }

    @PluginMethod
    fun stopDiscovery(call: PluginCall) = mainHandler.post {
        stopDiscoveryInternal()
        call.resolve()
    }

    /**
     * Connects to a receiver. Resolves `{ needsPairing: true }` without
     * connecting when the device is an Apple TV that hasn't been paired yet.
     */
    @PluginMethod
    fun connect(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id required")
        val volume = call.getInt("volume") ?: 50
        mainHandler.post {
            val device = devices[id] ?: return@post call.reject("Unknown device")
            if (device.needsPin && !AirPlayManager.isPaired(context, device)) {
                call.resolve(JSObject().put("needsPairing", true))
                return@post
            }
            stopDiscoveryInternal()
            AirPlayManager.connect(context, device, volume)
            call.resolve(JSObject().put("needsPairing", false))
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) = mainHandler.post {
        AirPlayManager.disconnect()
        call.resolve()
    }

    @PluginMethod
    fun setVolume(call: PluginCall) {
        AirPlayManager.setVolume(call.getInt("volume") ?: 50)
        call.resolve()
    }

    /** Asks the device to show its PIN; resolves once it does. */
    @PluginMethod
    fun startPairing(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id required")
        call.setKeepAlive(true)
        mainHandler.post {
            val device = devices[id] ?: return@post call.reject("Unknown device")
            var answered = false
            AirPlayManager.startPairing(
                context,
                device,
                onPinRequested = {
                    answered = true
                    call.resolve(JSObject().put("pinRequested", true))
                    call.setKeepAlive(false)
                },
                onDone = { ok, error ->
                    notifyListeners("pairingDone", JSObject().put("ok", ok).put("error", error))
                    if (!answered) {
                        call.reject(error ?: "Pairing failed")
                        call.setKeepAlive(false)
                    }
                },
            )
        }
    }

    /** Sends the PIN; the outcome arrives as a `pairingDone` event. */
    @PluginMethod
    fun submitPin(call: PluginCall) {
        val pin = call.getString("pin") ?: return call.reject("pin required")
        if (AirPlayManager.submitPin(pin)) call.resolve() else call.reject("No pairing in progress")
    }

    @PluginMethod
    fun cancelPairing(call: PluginCall) = mainHandler.post {
        AirPlayManager.cancelPairing()
        call.resolve()
    }

    // --- Discovery helpers (main thread) ---

    // NsdManager.resolveService handles one request at a time.
    private fun enqueueResolve(info: NsdServiceInfo) {
        pendingResolves.addLast(info)
        resolveNext()
    }

    @Suppress("DEPRECATION")
    private fun resolveNext() {
        if (resolving) return
        val info = pendingResolves.removeFirstOrNull() ?: return
        resolving = true
        nsd.resolveService(info, object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) = mainHandler.post {
                resolving = false
                resolveNext()
            }.let {}

            override fun onServiceResolved(resolved: NsdServiceInfo) = mainHandler.post {
                resolving = false
                toDevice(resolved)?.let {
                    devices[it.id] = it
                    emitDevices()
                }
                resolveNext()
            }.let {}
        })
    }

    @Suppress("DEPRECATION")
    private fun toDevice(info: NsdServiceInfo): AirPlayManager.Device? {
        val host = (info.host as? Inet4Address)?.hostAddress ?: info.host?.hostAddress ?: return null
        val txt = info.attributes.mapValues { (_, v) -> v?.toString(Charsets.UTF_8) ?: "" }
        val id = txt["deviceid"] ?: info.serviceName
        return AirPlayManager.Device(id, info.serviceName, host, info.port, txt)
    }

    private fun emitDevices() {
        val list = JSArray()
        devices.values.forEach { d ->
            list.put(
                JSObject()
                    .put("id", d.id)
                    .put("name", d.name)
                    .put("model", d.txt["model"] ?: "")
                    .put("needsPin", d.needsPin)
                    .put("paired", AirPlayManager.isPaired(context, d)),
            )
        }
        notifyListeners("devicesChanged", JSObject().put("devices", list))
    }

    private fun stopDiscoveryInternal() {
        discoveryListener?.let { runCatching { nsd.stopServiceDiscovery(it) } }
        discoveryListener = null
        pendingResolves.clear()
        resolving = false
    }
}
