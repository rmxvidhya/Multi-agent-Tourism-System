const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

async function getCoordinates(placeName) {
  try {
    console.log(`Getting coordinates for: ${placeName}`);
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: placeName,
        format: 'json',
        limit: 1
      },
      headers: {
        'User-Agent': 'TourismAgent/1.0'
      }
    });

    if (response.data.length === 0) {
      console.log(`Place not found: ${placeName}`);
      return { found: false, message: "Place not found" };
    }

    const result = {
      found: true,
      latitude: parseFloat(response.data[0].lat),
      longitude: parseFloat(response.data[0].lon),
      display_name: response.data[0].display_name
    };
    console.log(`Coordinates found:`, result);
    return result;
  } catch (error) {
    console.error('Error retrieving coordinates:', error.message);
    return { found: false, error: error.message };
  }
}

async function getWeather(latitude, longitude, placeName) {
  try {
    console.log(`Getting weather data for: ${placeName}`);
    const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude,
        longitude,
        current: 'temperature_2m,precipitation_probability',
        timezone: 'auto'
      }
    });

    const result = {
      place: placeName,
      temperature: response.data.current.temperature_2m,
      precipitation_probability: response.data.current.precipitation_probability || 0,
      unit: response.data.current_units.temperature_2m
    };
    console.log(`Weather data:`, result);
    return result;
  } catch (error) {
    console.error('Error getting weather data:', error.message);
    return { error: error.message };
  }
}

async function getBudget(placeName) {
  try {
    console.log(`Getting flight data for: ${placeName}`);

    const url = `https://serpapi.com/search`
    const response = await axios.get(url, {
      params: {
        engine: "google_flights",
        departure_id: "BLR",
        arrival_id: placeName,
        hl: "en",
        gl: "us",
        currency: "USD",
        outbound_date: "2025-11-30",
        return_date: "2025-12-06",
        api_key: "28cc24f980f5ddabed1a0b52a778544d9e6abee5f85cc12b3b87624e7d022a2a"
      },
    });
 
    const bestFlight= response.data.best_flights;
    const price= bestFlight[0].price;
    const result = {
      place: placeName,
      price: price
    };
    console.log(`Flight data:`, result);
    return result;
  } catch (error) {
    console.error('Error getting flight data:', error.message);
    return { error: error.message };
  }
}
async function getTouristPlaces(latitude, longitude, placeName) {
  try {
    console.log(`Getting tourist places for: ${placeName}`);
    const radius = 10000;
    const query = `
      [out:json][timeout:25];
      (
        node["tourism"](around:${radius},${latitude},${longitude});
        way["tourism"](around:${radius},${latitude},${longitude});
        node["historic"](around:${radius},${latitude},${longitude});
        way["historic"](around:${radius},${latitude},${longitude});
        node["leisure"="park"](around:${radius},${latitude},${longitude});
        way["leisure"="park"](around:${radius},${latitude},${longitude});
      );
      out center 20;
    `;

    const response = await axios.post('https://overpass-api.de/api/interpreter', query, {
      headers: {
        'Content-Type': 'text/plain'
      },
      timeout: 30000
    });

    const places = response.data.elements
      .filter(el => el.tags && el.tags.name)
      .map(el => ({
        name: el.tags.name,
        type: el.tags.tourism || el.tags.historic || el.tags.leisure
      }))
      .slice(0, 5);

    const result = {
      place: placeName,
      attractions: places
    };
    console.log(`Found ${places.length} places`);
    return result;
  } catch (error) {
    console.error('Error getting tourist places:', error.message);
    return { error: error.message, attractions: [] };
  }
}

app.post('/api/plan-trip', async (req, res) => {
  try {
    const { input } = req.body;

    if (!input) {
      return res.status(400).json({ error: 'Input is required' });
    }

    console.log(`\nNew request: ${input}`);

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const tools = [
      {
        name: 'get_coordinates',
        description: 'Get latitude and longitude coordinates for a place name using Nominatim API',
        input_schema: {
          type: 'object',
          properties: {
            place_name: {
              type: 'string',
              description: 'The name of the place to geocode'
            }
          },
          required: ['place_name']
        }
      },
      {
        name: 'get_weather',
        description: 'Get current weather information for a location using coordinates',
        input_schema: {
          type: 'object',
          properties: {
            latitude: {
              type: 'number',
              description: 'Latitude coordinate'
            },
            longitude: {
              type: 'number',
              description: 'Longitude coordinate'
            },
            place_name: {
              type: 'string',
              description: 'Name of the place for reference'
            }
          },
          required: ['latitude', 'longitude', 'place_name']
        }
      },
      {
        name: 'get_tourist_places',
        description: 'Get tourist attractions near a location using Overpass API',
        input_schema: {
          type: 'object',
          properties: {
            latitude: {
              type: 'number',
              description: 'Latitude coordinate'
            },
            longitude: {
              type: 'number',
              description: 'Longitude coordinate'
            },
            place_name: {
              type: 'string',
              description: 'Name of the place for reference'
            }
          },
          required: ['latitude', 'longitude', 'place_name']
        }
      },
      {
        name: 'get_budget',
        description: 'Get the next flight prices using API',
        input_schema: {
          type: 'object',
          properties: {
            latitude: {
              type: 'number',
              description: 'Latitude coordinate'
            },
            longitude: {
              type: 'number',
              description: 'Longitude coordinate'
            },
            place_name: {
              type: 'string',
              description: 'Name of the place for reference'
            }
          },
          required: ['latitude', 'longitude', 'place_name']
        }
      }
    ];

    let messages = [
      {
        role: 'user',
        content: `You are a Tourism AI Agent whose job is to help users plan short trips by fetching real-time data and presenting it clearly.

Goals
- Determine whether the user asks for weather, nearby attractions,budget or both.
-If the user requires the budgeting, assume pickup location to be Bangalore, Karnataka, India and drop location as the user specified location.
- If both pickup and drop locations are missing then do no assume data and calculate, politely informthe user that enough data is not avalable and mention both arrival and departure flight location details in the prompt and try again.
- Use the provided tools (get_coordinates, get_weather, get_tourist_places, get_budget) to fetch real data when needed.
- Produce a concise, friendly, human-facing answer when data is available.
- Provide an approximate budget for the trip assuming the user would be staying for about 5 days and the cost for the trip should include the plane tickets, the average food expense on the cuisine present in the location, as well as the accomodation charges.(if any issues in the flight prices, mention the price of the next available flight for the place from bangalore)

Strict tool usage workflow
1. ALWAYS call get_coordinates first with { place_name: string } to resolve the place.
   - If get_coordinates returns found: false, STOP and reply with a short, polite message stating you could not find the place and ask for a clarification or alternate name. Do NOT call other tools.
2. Only call get_weather and/or get_tourist_places and/or get_budget after coordinates are available and only if the user's request implies those data types.
3. When requesting a tool call, emit exactly one tool_use block for that call (see "Assistant response format" below).

Assistant response format (required)
- Your message content must be an array of blocks. Each block must be one of:
  - { type: 'text', text: string } — a human-facing text block.
  - { type: 'tool_use', id: string, name: string, input: object } — a structured tool request.
- Examples:
  - { type: 'tool_use', id: 't1', name: 'get_coordinates', input: { place_name: 'Paris, France' } }
  - { type: 'text', text: 'Summary: This is the weather for Paris...' }
- Use numeric latitude/longitude (numbers) when creating tool_use input objects for get_weather and get_tourist_places. Always include place_name in tool inputs for traceability.
- When you have no more tool_use blocks in your response, the server will treat the reply as final and return the concatenated text blocks to the user.

Final user-facing answer requirements (when no tool_use blocks remain)
- Start with a single-line summary sentence.
- Include the resolved place display name and coordinates.
- Provide weather details as a bullet list: temperature (°C), precipitation probability (%), and units.
- Provide up to 5 nearby attractions as a bullet list; include each attraction name, type, and one short reason to visit.
- Also provide user budget range in one line keeping in the mind the location constraints as well as the the flight prices

Formatting and safety
- Do not include raw tool result JSON, API keys, or internal logs in text blocks — present only human-readable text.
- Do not ask for next steps, return just the answer.
- Do not return any bolded/italic or formatted text.
- Keep responses concise and helpful.

Example 1
Input: I’m going to go to Bangalore, let’s plan my trip.
Output:
In Bangalore these are the places you can go,
- Lalbagh
- Sri Chamarajendra Park
- Bangalore palace
- Bannerghatta National Park
- Jawaharlal Nehru Planetarium
Example 2
Input: I’m going to go to Bangalore, what is the temperature there
Output:
- In Bangalore it’s currently 24°C with a chance of 35% to rain.
Example 3
Input: I’m going to go to Bangalore, what is the temperature there? And what are the places I
can visit?
Output:
- In Bangalore it’s currently 24°C with a chance of 35% to rain. And these are the places you
can go:
- Lalbagh
- Sri Chamarajendra Park
- Bangalore palace
- Bannerghatta National Park
- Jawaharlal Nehru Planetarium



User request: ${input}`
      }
    ];

    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
      console.log(`\nIteration ${iterations + 1}`);

      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          tools,
          messages
        },
        {
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          }
        }
      );

      const assistantContent = response.data.content;
      console.log(`Assistant response:`, JSON.stringify(assistantContent, null, 2));

      messages.push({
        role: 'assistant',
        content: assistantContent
      });

      const toolUses = assistantContent.filter(block => block.type === 'tool_use');

      if (toolUses.length === 0) {
        const textContent = assistantContent
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n');

        console.log(`Final response ready`);
        return res.json({ response: textContent });
      }

      console.log(`Found ${toolUses.length} tool(s) to execute`);

      const toolResults = [];

      for (const toolUse of toolUses) {
        console.log(`Executing tool: ${toolUse.name}`);

        let toolResult;
        try {
          if (toolUse.name === 'get_coordinates') {
            toolResult = await getCoordinates(toolUse.input.place_name);
          } else if (toolUse.name === 'get_weather') {
            toolResult = await getWeather(
              toolUse.input.latitude,
              toolUse.input.longitude,
              toolUse.input.place_name
            );
          } else if (toolUse.name === 'get_tourist_places') {
            toolResult = await getTouristPlaces(
              toolUse.input.latitude,
              toolUse.input.longitude,
              toolUse.input.place_name
            );
          } else if (toolUse.name === 'get_budget') {
            toolResult = await getBudget(

              toolUse.input.place_name
            );
            console.log(`Executing tool: getbudget`);
          } else {
            toolResult = { error: 'Unknown tool' };
          }
        } catch (error) {
          console.error(`Tool execution error:`, error.message);
          toolResult = { error: error.message };
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(toolResult)
        });
      }

      messages.push({
        role: 'user',
        content: toolResults
      });

      console.log(`Sent ${toolResults.length} tool result(s) back to Claude`);

      iterations++;
    }

    console.log('Maximum iterations reached');
    return res.status(500).json({ error: 'Maximum iterations reached' });

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);

    if (error.response?.data) {
      console.error('Full error details:', JSON.stringify(error.response.data, null, 2));
    }

    res.status(500).json({
      error: error.response?.data?.error?.message || error.message
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({
    service: 'Tourism Agent Backend',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      planTrip: 'POST /api/plan-trip'
    }
  });
});

app.listen(PORT, () => {
  console.log(`Tourism Agent Backend Server`);
  console.log(`Running on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});