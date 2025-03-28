import { Client } from "@googlemaps/google-maps-services-js";
import dotenv from "dotenv";

dotenv.config();

// Initialize Google Maps client
const client = new Client({});

/**
 * Auto-complete place names
 * @param {string} input - Partial address input
 * @returns {Promise<Array>} - Array of place predictions
 */
export const getPlacePredictions = async (input) => {
  try {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      throw new Error("Google Maps API key is missing");
    }

    const response = await client.placeAutocomplete({
      params: {
        input,
        key: process.env.GOOGLE_MAPS_API_KEY,
      },
    });

    if (response.data.status !== "OK") {
      throw new Error(`Place autocomplete error: ${response.data.status}`);
    }

    return response.data.predictions.map((prediction) => ({
      placeId: prediction.place_id,
      description: prediction.description,
    }));
  } catch (error) {
    console.error("Error in place predictions:", error);
    throw error;
  }
};

/**
 * Get place details by place ID
 * @param {string} placeId - Google Place ID
 * @returns {Promise<Object>} - Place details
 */
export const getPlaceDetails = async (placeId) => {
  try {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      throw new Error("Google Maps API key is missing");
    }

    const response = await client.placeDetails({
      params: {
        place_id: placeId,
        key: process.env.GOOGLE_MAPS_API_KEY,
      },
    });

    if (response.data.status !== "OK") {
      throw new Error(`Place details error: ${response.data.status}`);
    }

    return {
      placeId: response.data.result.place_id,
      name: response.data.result.name,
      formattedAddress: response.data.result.formatted_address,
      location: response.data.result.geometry.location,
    };
  } catch (error) {
    console.error("Error in place details:", error);
    throw error;
  }
};

/**
 * Calculate distance between two places
 * @param {string} originPlaceId - Origin place ID
 * @param {string} destinationPlaceId - Destination place ID
 * @returns {Promise<Object>} - Distance and duration information
 */
export const calculateDistance = async (originPlaceId, destinationPlaceId) => {
  try {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      throw new Error("Google Maps API key is missing");
    }

    const response = await client.distancematrix({
      params: {
        origins: [`place_id:${originPlaceId}`],
        destinations: [`place_id:${destinationPlaceId}`],
        mode: "driving",
        key: process.env.GOOGLE_MAPS_API_KEY,
      },
    });

    if (response.data.status !== "OK") {
      throw new Error(`Distance matrix error: ${response.data.status}`);
    }

    const result = response.data.rows[0].elements[0];

    if (result.status !== "OK") {
      throw new Error(`Route calculation error: ${result.status}`);
    }

    // Get origin and destination details for better context
    const originDetails = await getPlaceDetails(originPlaceId);
    const destinationDetails = await getPlaceDetails(destinationPlaceId);

    // Also get the directions to get polyline data
    const directionsResponse = await client.directions({
      params: {
        origin: `place_id:${originPlaceId}`,
        destination: `place_id:${destinationPlaceId}`,
        mode: "driving",
        key: process.env.GOOGLE_MAPS_API_KEY,
      },
    });

    let routePolyline = null;
    let routeBounds = null;

    if (directionsResponse.data.status === "OK") {
      const route = directionsResponse.data.routes[0];
      routePolyline = route.overview_polyline;
      routeBounds = route.bounds;
    }

    return {
      distanceText: result.distance.text,
      distanceValue: result.distance.value / 1000, // Convert to kilometers
      durationText: result.duration.text,
      durationValue: result.duration.value, // Seconds
      origin: originDetails,
      destination: destinationDetails,
      route: {
        overview_polyline: routePolyline,
        bounds: routeBounds,
        legs:
          directionsResponse.data.status === "OK"
            ? directionsResponse.data.routes[0].legs
            : null,
      },
    };
  } catch (error) {
    console.error("Error in distance calculation:", error);
    throw error;
  }
};

/**
 * Calculate route with waypoints
 * @param {string} originPlaceId - Origin place ID
 * @param {string} destinationPlaceId - Destination place ID
 * @param {Array<Object>} waypoints - Array of waypoint objects with placeId and optional stopover properties
 * @param {Object} options - Additional options for route calculation
 * @returns {Promise<Object>} - Route information
 */
export const calculateRouteWithWaypoints = async (
  originPlaceId,
  destinationPlaceId,
  waypoints = [],
  options = {}
) => {
  try {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      throw new Error("Google Maps API key is missing");
    }

    // Get details for origin and destination
    const originDetails = await getPlaceDetails(originPlaceId);
    const destinationDetails = await getPlaceDetails(destinationPlaceId);

    // Format waypoints for the API
    const formattedWaypoints = [];
    const waypointDetails = [];

    // Process waypoints and collect details
    for (const waypoint of waypoints) {
      // Format can be string or object
      let waypointId;
      let isStopover = true;

      if (typeof waypoint === "string") {
        waypointId = waypoint;
      } else {
        waypointId = waypoint.placeId;
        isStopover = waypoint.stopover !== false; // default to true
      }

      // Get details for each waypoint for better context
      const details = await getPlaceDetails(waypointId);
      waypointDetails.push(details);

      // Format for Google Directions API
      formattedWaypoints.push({
        location: `place_id:${waypointId}`,
        stopover: isStopover,
      });
    }

    // Set up optimization setting
    const optimize = options.optimize === true;

    // Format waypoints for the Directions API in the required format
    const waypointString = formattedWaypoints.map(
      (wp) =>
        `${wp.stopover ? "" : "via:"}place_id:${wp.location.replace(
          "place_id:",
          ""
        )}`
    );

    // Make request to Directions API
    const response = await client.directions({
      params: {
        origin: `place_id:${originPlaceId}`,
        destination: `place_id:${destinationPlaceId}`,
        waypoints: waypointString,
        optimizeWaypoints: optimize,
        mode: "driving",
        alternatives: options.alternatives === true,
        key: process.env.GOOGLE_MAPS_API_KEY,
      },
    });

    if (response.data.status !== "OK") {
      throw new Error(`Directions error: ${response.data.status}`);
    }

    const route = response.data.routes[0];
    let totalDistance = 0;
    let totalDuration = 0;

    // Create a structured legs array with more details
    const detailedLegs = [];

    route.legs.forEach((leg, index) => {
      totalDistance += leg.distance.value;
      totalDuration += leg.duration.value;

      // Add additional context
      let from = index === 0 ? originDetails : waypointDetails[index - 1];
      let to =
        index === route.legs.length - 1
          ? destinationDetails
          : waypointDetails[index];

      detailedLegs.push({
        ...leg,
        from,
        to,
        index,
      });
    });

    // Create waypoint order mapping if route was optimized
    let waypointOrder = null;
    if (optimize && route.waypoint_order && route.waypoint_order.length > 0) {
      waypointOrder = route.waypoint_order.map((index) => ({
        originalIndex: index,
        placeId: waypoints[index].placeId || waypoints[index],
        details: waypointDetails[index],
      }));
    }

    // Create a more detailed response
    return {
      distanceText: `${(totalDistance / 1000).toFixed(1)} km`,
      distanceValue: totalDistance / 1000, // Convert to kilometers
      durationText: convertSecondsToTime(totalDuration),
      durationValue: totalDuration, // Seconds
      origin: originDetails,
      destination: destinationDetails,
      waypoints: waypointDetails,
      legs: detailedLegs,
      optimizedWaypointOrder: waypointOrder,
      route: {
        summary: route.summary,
        overview_polyline: route.overview_polyline,
        bounds: route.bounds,
        warnings: route.warnings,
        copyrights: route.copyrights,
        legs: route.legs,
      },
      alternatives:
        response.data.routes.length > 1
          ? response.data.routes.slice(1).map((r) => ({
              summary: r.summary,
              overview_polyline: r.overview_polyline,
              bounds: r.bounds,
            }))
          : [],
    };
  } catch (error) {
    console.error("Error in route calculation:", error);
    // Add more detailed error information
    if (error.response) {
      console.error(`Google Maps API error status: ${error.response.status}`);
      console.error(
        `Google Maps API error data: ${JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      console.error("No response received from Google Maps API");
    }

    throw new Error(
      `Route calculation failed: ${error.message || "Unknown error"}`
    );
  }
};

/**
 * Convert seconds to human-readable time format
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted time string
 */
const convertSecondsToTime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} hr ${minutes} min`;
  }
  return `${minutes} min`;
};

/**
 * Retrieve route data from stored snapshot
 * @param {Object} routeSnapshot - The stored route snapshot
 * @returns {Object} - Formatted route information
 */
export const getRouteFromSnapshot = (routeSnapshot) => {
  if (!routeSnapshot) {
    return null;
  }

  try {
    // Extract key information from the snapshot
    const {
      distanceValue,
      durationValue,
      durationText,
      origin,
      destination,
      waypoints,
      route,
    } = routeSnapshot;

    return {
      distanceValue,
      durationValue,
      durationText: durationText || convertSecondsToTime(durationValue),
      route: {
        origin,
        destination,
        waypoints: waypoints || [],
        polyline: route?.overview_polyline,
        bounds: route?.bounds,
      },
    };
  } catch (error) {
    console.error("Error parsing route snapshot:", error);
    return null;
  }
};

export default {
  getPlacePredictions,
  getPlaceDetails,
  calculateDistance,
  calculateRouteWithWaypoints,
  getRouteFromSnapshot,
};
