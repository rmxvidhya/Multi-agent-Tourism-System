# Multi-Agent Tourism System

An intelligent tourism planning system powered by multiple AI agents that work together to provide weather information and tourist attraction recommendations.

## Features

- Real-time weather data from Open-Meteo API
- Tourist attraction recommendations from OpenStreetMap
- AI-powered natural language interface
- Multi-agent orchestration system

## Architecture

- **Parent Agent**: Tourism Orchestrator (coordinates all operations)
- **Weather Agent**: Fetches current weather and forecasts
- **Places Agent**: Recommends up to 5 tourist attractions
- **Geocoding Service**: Converts place names to coordinates

## Technologies

- Python 3.10+
- Flask (Web framework)
- OpenAI GPT-3.5 (Natural language processing)
- Open-Meteo API (Weather data)
- Overpass API (Tourist attractions)
- Nominatim API (Geocoding)

## Live Demo

[Your Vercel URL will go here]

## Local Setup

1. Clone the repository
2. Create virtual environment: `python3 -m venv venv`
3. Activate it: `source venv/bin/activate`
4. Install dependencies: `pip install -r requirements.txt`
5. Create `.env` file with your OpenAI API key
6. Run: `python app.py`
7. Open: http://localhost:5000

## API Endpoints

- `GET /` - Main web interface
- `POST /api/query` - Process tourism queries
- `GET /health` - Health check

## Example Queries

- "I want to visit Paris, what are the places I can see?"
- "What is the weather in Tokyo?"
- "I'm going to London, what is the temperature and what places can I visit?"

## Author

[Your Name]

## Assignment

Built for Inkle AI Intern Assignment
