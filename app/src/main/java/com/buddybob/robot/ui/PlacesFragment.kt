package com.buddybob.robot.ui

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.buddybob.robot.BuddybobApp
import com.buddybob.robot.MainActivity
import com.buddybob.robot.R
import com.buddybob.robot.platform.PlatformApi
import com.buddybob.robot.robot.NavigationController
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class PlacesFragment : Fragment() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private lateinit var placesAdapter: PlacesAdapter
    private lateinit var routeAdapter: RouteAdapter
    private lateinit var listPlaces: RecyclerView
    private lateinit var listRoute: RecyclerView
    private lateinit var routeEmpty: TextView
    private lateinit var empty: TextView
    private lateinit var status: TextView
    private lateinit var editWait: EditText
    private lateinit var checkReturn: CheckBox
    private lateinit var btnStart: Button
    private lateinit var btnStop: Button

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)
    @Volatile private var routeRunning = false

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_places, container, false)
        listPlaces = root.findViewById(R.id.list_places)
        listRoute = root.findViewById(R.id.list_route)
        routeEmpty = root.findViewById(R.id.text_route_empty)
        empty = root.findViewById(R.id.text_empty)
        status = root.findViewById(R.id.text_nav_status)
        editWait = root.findViewById(R.id.edit_wait_seconds)
        checkReturn = root.findViewById(R.id.check_return)
        btnStart = root.findViewById(R.id.btn_start)
        btnStop = root.findViewById(R.id.btn_stop_nav)

        placesAdapter = PlacesAdapter { refreshRouteList() }
        listPlaces.layoutManager = LinearLayoutManager(requireContext())
        listPlaces.adapter = placesAdapter

        routeAdapter = RouteAdapter { place ->
            placesAdapter.removeFromRoute(place)
        }
        listRoute.layoutManager = LinearLayoutManager(requireContext())
        listRoute.adapter = routeAdapter

        val nav = BuddybobApp.instance.robot.navigation
        nav.onStatus = { msg -> mainHandler.post { status.text = msg } }

        btnStart.setOnClickListener { startRoute() }
        btnStop.setOnClickListener { stopRoute() }
        root.findViewById<Button>(R.id.btn_back).setOnClickListener {
            stopRoute()
            (activity as? MainActivity)?.openReceptionOrHome()
        }

        loadPlaces()
        return root
    }

    private fun refreshRouteList() {
        val route = placesAdapter.getSelectedRoute()
        routeAdapter.submit(route)
        listRoute.visibility = if (route.isEmpty()) View.GONE else View.VISIBLE
        routeEmpty.visibility = if (route.isEmpty()) View.VISIBLE else View.GONE
    }

    private fun loadPlaces() {
        empty.visibility = View.VISIBLE
        empty.text = getString(R.string.places_loading)
        listPlaces.visibility = View.GONE

        val robot = BuddybobApp.instance.robot

        if (!robot.canUseApi()) {
            showPlaces(demoPlaces())
            status.text = "Punti esempio — collega il robot per i punti reali"
            return
        }

        runCatching {
            robot.navigation.getPlaceList { places ->
                mainHandler.post {
                    showPlaces(places)
                    if (places.isNotEmpty()) syncPlacesToPlatform(places)
                }
            }
        }.onFailure {
            mainHandler.post {
                showPlaces(demoPlaces())
                status.text = "Impossibile leggere la mappa: ${it.message}"
            }
        }
    }

    private fun showPlaces(places: List<NavigationController.Place>) {
        if (!isAdded) return
        if (places.isEmpty()) {
            empty.visibility = View.VISIBLE
            empty.text = getString(R.string.places_empty)
            listPlaces.visibility = View.GONE
        } else {
            empty.visibility = View.GONE
            listPlaces.visibility = View.VISIBLE
            placesAdapter.submit(places)
            status.text = getString(R.string.places_hint)
        }
    }

    private fun startRoute() {
        val route = placesAdapter.getSelectedRoute()
        if (route.isEmpty()) {
            Toast.makeText(requireContext(), R.string.places_select_one, Toast.LENGTH_SHORT).show()
            return
        }
        val waitSec = editWait.text.toString().toIntOrNull() ?: 0
        val returnHome = checkReturn.isChecked
        routeRunning = true
        btnStart.isEnabled = false

        scope.launch {
            val goTo = BuddybobApp.instance.robot.goTo
            for ((i, place) in route.withIndex()) {
                if (!routeRunning) break
                val label = BuddybobApp.instance.robot.placeContent.get(place.name)
                    ?.labelOrName()
                    ?: BuddybobApp.instance.config.placeLabel(place.name)
                status.text = getString(R.string.places_going, label)

                val isLast = i == route.lastIndex
                val after = when {
                    isLast && returnHome ->
                        com.buddybob.robot.platform.GoToController.After.RETURN
                    isLast ->
                        com.buddybob.robot.platform.GoToController.After.STAY
                    else ->
                        com.buddybob.robot.platform.GoToController.After.LEG
                }

                val err = withContext(Dispatchers.IO) {
                    goTo.goBlocking(
                        placeName = place.name,
                        after = after,
                        returnAfterSec = if (isLast && returnHome) waitSec else 0
                    )
                }
                if (!routeRunning) break
                if (err != null) {
                    status.text = err
                    break
                }

                if (!isLast && waitSec > 0) {
                    status.text = getString(R.string.places_waiting, label, waitSec)
                    delay(waitSec * 1000L)
                }
            }

            routeRunning = false
            status.text = getString(R.string.places_route_done)
            btnStart.isEnabled = true
            placesAdapter.clearSelection()
        }
    }

    private fun stopRoute() {
        routeRunning = false
        runCatching { BuddybobApp.instance.robot.haltAllMotion() }
        (activity as? MainActivity)?.hidePlaceDisplay()
        status.text = getString(R.string.places_stop)
        btnStart.isEnabled = true
    }

    private fun demoPlaces(): List<NavigationController.Place> = listOf(
        NavigationController.Place("reception", 0.0, 0.0, 0.0),
        NavigationController.Place("meeting_room", 2.5, 1.0, 0.0),
        NavigationController.Place("charging_pile", -1.2, 0.8, 1.57),
        NavigationController.Place("standby", 0.5, -2.0, 0.0)
    )

    private fun syncPlacesToPlatform(places: List<NavigationController.Place>) {
        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                PlatformApi().syncPlaces(
                    places.map { PlatformApi.PlaceSync(it.name, it.x, it.y, it.theta) }
                )
                val configs = PlatformApi().fetchPlaceConfigs()
                BuddybobApp.instance.robot.placeContent.replaceAll(configs)
            }
        }
    }

    override fun onDestroyView() {
        routeRunning = false
        job.cancel()
        super.onDestroyView()
    }

    companion object {
        fun newInstance() = PlacesFragment()
    }
}
