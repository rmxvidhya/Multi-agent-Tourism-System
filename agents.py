import requests
import json
from typing import Dict, List, Optional

class GeocodingService:
    """Converts place names to coordinates using Nominatim API"""
    
    @staticmethod
    def get_coordinates(place_name: str) -> Optional[Dict]:
        """Get latitude and longitude for a place name"""
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": place_name,
            "format": "json",
            "limit": 1
        }
        headers = {
            "User-Agent": "TourismAgentSystem/1.0"
        }
        
        try:
            response = requests.get(url, params=params, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if data and len(data) > 0:
                return {
                    "lat": float(data[0]["lat"]),
                    "lon": float(data[0]["lon"]),
                    "display_name": data[0]["display_name"]
                }
            return None
        except Exception as e:
            print(f"Geocoding error: {e}")
            return None


class WeatherAgent:
    """Fetches weather data using Open-Meteo API"""
    
    @staticmethod
    def get_weather(latitude: float, longitude: float) -> Dict:
        """Get current weather and forecast"""
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "current": "temperature_2m,precipitation_probability,weather_code",
            "temperature_unit": "celsius",
            "timezone": "auto"
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            current = data.get("current", {})
            
            # Weather code interpretation
            weather_code = current.get("weather_code", 0)
            weather_desc = WeatherAgent._interpret_weather_code(weather_code)
            
            return {
                "temperature": current.get("temperature_2m"),
                "temperature_unit": "°C",
                "precipitation_probability": current.get("precipitation_probability", 0),
                "weather_description": weather_desc,
                "timezone": data.get("timezone", "UTC")
            }
        except Exception as e:
            print(f"Weather API error: {e}")
            return {
                "error": "Unable to fetch weather data",
                "details": str(e)
            }
    
    @staticmethod
    def _interpret_weather_code(code: int) -> str:
        """Convert WMO weather code to description"""
        weather_codes = {
            0: "Clear sky",
            1: "Mainly clear",
            2: "Partly cloudy",
            3: "Overcast",
            45: "Foggy",
            48: "Depositing rime fog",
            51: "Light drizzle",
            53: "Moderate drizzle",
            55: "Dense drizzle",
            61: "Slight rain",
            63: "Moderate rain",
            65: "Heavy rain",
            71: "Slight snow",
            73: "Moderate snow",
            75: "Heavy snow",
            95: "Thunderstorm"
        }
        return weather_codes.get(code, "Unknown")


class PlacesAgent:
    """Fetches tourist attractions using Overpass API"""
    
    @staticmethod
    def get_tourist_places(latitude: float, longitude: float, radius: int = 5000) -> List[Dict]:
        """Get up to 5 tourist attractions near the coordinates"""
        url = "https://overpass-api.de/api/interpreter"
        
        # Overpass QL query for tourist attractions
        query = f"""
        [out:json][timeout:25];
        (
          node["tourism"~"attraction|museum|viewpoint|gallery|theme_park"]
            (around:{radius},{latitude},{longitude});
          way["tourism"~"attraction|museum|viewpoint|gallery|theme_park"]
            (around:{radius},{latitude},{longitude});
        );
        out body 5;
        >;
        out skel qt;
        """
        
        try:
            response = requests.post(url, data={"data": query}, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            places = []
            elements = data.get("elements", [])
            
            for element in elements[:5]:  # Limit to 5 places
                tags = element.get("tags", {})
                name = tags.get("name", "Unnamed attraction")
                tourism_type = tags.get("tourism", "attraction")
                
                place_info = {
                    "name": name,
                    "type": tourism_type.replace("_", " ").title(),
                    "lat": element.get("lat"),
                    "lon": element.get("lon")
                }
                
                # Add optional details if available
                if "website" in tags:
                    place_info["website"] = tags["website"]
                if "description" in tags:
                    place_info["description"] = tags["description"]
                
                places.append(place_info)
            
            return places
        except Exception as e:
            print(f"Places API error: {e}")
            return [{"error": "Unable to fetch tourist places", "details": str(e)}]


class TourismOrchestrator:
    """Parent agent that orchestrates child agents"""
    
    def __init__(self, openai_client):
        self.client = openai_client
        self.geocoding = GeocodingService()
        self.weather_agent = WeatherAgent()
        self.places_agent = PlacesAgent()
    
    def analyze_query(self, user_query: str) -> Dict:
        """Analyze user query to determine which agents to call"""
        query_lower = user_query.lower()
        
        needs_weather = any(word in query_lower for word in 
                           ["weather", "temperature", "rain", "forecast", "climate", "hot", "cold"])
        needs_places = any(word in query_lower for word in 
                          ["visit", "places", "attractions", "see", "do", "trip", "tourism", "sightseeing"])
        
        # Extract place name (simplified approach)
        place_name = self._extract_place_name(user_query)
        
        return {
            "needs_weather": needs_weather,
            "needs_places": needs_places,
            "place_name": place_name
        }
    
    def _extract_place_name(self, user_query: str) -> str:
        """Extract place name from query using GPT"""
        try:
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "Extract only the location/place name from the user's query. Return just the place name, nothing else. If no place is mentioned, return 'unknown'."},
                    {"role": "user", "content": user_query}
                ],
                temperature=0
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"Place extraction error: {e}")
            return "unknown"
    
    def process_request(self, user_query: str) -> Dict:
        """Main orchestration logic"""
        # Step 1: Analyze the query
        analysis = self.analyze_query(user_query)
        place_name = analysis["place_name"]
        
        if place_name.lower() == "unknown" or not place_name:
            return {
                "success": False,
                "message": "I couldn't identify a place name in your query. Please specify which location you'd like information about."
            }
        
        # Step 2: Get coordinates
        coords = self.geocoding.get_coordinates(place_name)
        if not coords:
            return {
                "success": False,
                "message": f"I don't know if the place '{place_name}' exists, or I couldn't find its location. Please check the spelling and try again."
            }
        
        result = {
            "success": True,
            "place": {
                "name": place_name,
                "full_name": coords["display_name"],
                "coordinates": {
                    "lat": coords["lat"],
                    "lon": coords["lon"]
                }
            }
        }
        
        # Step 3: Call appropriate agents
        if analysis["needs_weather"]:
            weather_data = self.weather_agent.get_weather(coords["lat"], coords["lon"])
            result["weather"] = weather_data
        
        if analysis["needs_places"]:
            places_data = self.places_agent.get_tourist_places(coords["lat"], coords["lon"])
            result["places"] = places_data
        
        # Step 4: Generate natural language response
        result["response"] = self._generate_response(result, analysis)
        
        return result
    
    def _generate_response(self, result: Dict, analysis: Dict) -> str:
        """Generate a natural language response using GPT"""
        # Prepare context for GPT
        context_parts = []
        
        place_info = result.get("place", {})
        context_parts.append(f"Location: {place_info.get('full_name', place_info.get('name'))}")
        
        if "weather" in result and "error" not in result["weather"]:
            weather = result["weather"]
            context_parts.append(f"Weather: {weather['temperature']}{weather['temperature_unit']}, {weather['weather_description']}, {weather['precipitation_probability']}% chance of rain")
        
        if "places" in result and result["places"]:
            places_list = []
            for place in result["places"]:
                if "error" not in place:
                    places_list.append(f"{place['name']} ({place['type']})")
            if places_list:
                context_parts.append(f"Tourist attractions: {', '.join(places_list)}")
        
        context = "\n".join(context_parts)
        
        try:
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are a helpful tourism assistant. Create a friendly, concise response based on the data provided. Include all relevant information but keep it conversational."},
                    {"role": "user", "content": f"User query: {analysis.get('place_name')}\n\nData:\n{context}\n\nCreate a natural response."}
                ],
                temperature=0.7
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"Response generation error: {e}")
            return "Here's what I found: " + context
