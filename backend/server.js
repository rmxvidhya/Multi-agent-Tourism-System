const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Tool implementations
async function getCoordinates(placeName) {
  try {
    console.log(`🔍 Getting coordinates for: ${placeName}`);
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
      console.log(`❌ Place not found: ${placeName}`);
      return { found: false, message: "Place not found" };
    }
    
    const result = {
      found: true,
      latitude: parseFloat(response.data[0].lat),
      longitude: parseFloat(response.data[0].lon),
      display_name: response.data[0].display_name
    };
    console.log(`✅ Coordinates found:`, result);
    return result;
  } catch (error) {
    console.error('❌ Error getting coordinates:', error.message);
    return { error: error.message };
  }
}

async function getWeather(latitude, longitude, placeName) {
  try {
    console.log(`🌤️  Getting weather for: ${placeName}`);
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
    console.log(`✅ Weather data:`, result);
    return result;
  } catch (error) {
    console.error('❌ Error getting weather:', error.message);
    return { error: error.message };
  }
}

async function getTouristPlaces(latitude, longitude, placeName) {
  try {
    console.log(`🏛️  Getting tourist places for: ${placeName}`);
    const radius = 10000; // 10km radius
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
      }
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
    console.log(`✅ Found ${places.length} attractions`);
    return result;
  } catch (error) {
    console.error('❌ Error getting tourist places:', error.message);
    return { error: error.message };
  }
}

// Main trip planning endpoint
app.post('/api/plan-trip', async (req, res) => {
  try {
    const { input } = req.body;
    
    if (!input) {
      return res.status(400).json({ error: 'Input is required' });
    }

    console.log(`\n🎯 New request: ${input}`);

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    
    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Initial request to Claude
    let conversationHistory = [
      {
        role: 'user',
        content: `You are a Tourism AI Agent that helps users plan their trips. Your job is to:

1. Understand what information the user wants (weather, places to visit, or both)
2. Use the available tools to get real-time information
3. Present the information in a friendly, helpful manner

Process:
- First, use get_coordinates to find the location
- If coordinates are not found, politely inform the user that you don't know if this place exists
- Based on the user's request, call get_weather and/or get_tourist_places
- Format the response naturally with proper formatting (use bullets for lists)

User request: ${input}`
      }
    ];

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
      }
    ];

    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
      console.log(`\n🔄 Iteration ${iterations + 1}`);
      
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          tools,
          messages: conversationHistory
        },
        {
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          }
        }
      );

      const assistantMessage = response.data.content;
      conversationHistory.push({
        role: 'assistant',
        content: assistantMessage
      });

      // Check if there's a tool use
      const toolUse = assistantMessage.find(block => block.type === 'tool_use');
      
      if (!toolUse) {
        // No more tools to use, return the final response
        const textContent = assistantMessage
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n');
        
        console.log(`✅ Final response ready`);
        return res.json({ response: textContent });
      }

      console.log(`🔧 Tool called: ${toolUse.name}`);

      // Execute the tool
      let toolResult;
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
      }

      // Add tool result to conversation
      conversationHistory.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(toolResult)
          }
        ]
      });

      iterations++;
    }

    console.log('⚠️  Maximum iterations reached');
    return res.status(500).json({ error: 'Maximum iterations reached' });

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: error.response?.data?.error?.message || error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
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
  console.log(`\n🚀 Tourism Agent Backend Server`);
  console.log(`📍 Running on port ${PORT}`);
  console.log(`🔗 http://localhost:${PORT}`);
  console.log(`✅ Ready to plan trips!\n`);
});