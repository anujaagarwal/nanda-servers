import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"; // Import SSE transport
// import { Transport } from "@modelcontextprotocol/sdk/transport.js"; // REMOVED Bad import
import express, { Request, Response } from "express"; // Import Express
import { z } from "zod";
import axios from "axios";
import * as dotenv from "dotenv";
import * as path from 'path';
import * as process from 'process';
import { randomUUID } from 'crypto'; // For session IDs
import cors from 'cors'; // Import cors

// Configure dotenv
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

console.log("Initializing MCP server logic...");

const OPENWEATHERMAP_API_KEY = process.env.OPENWEATHERMAP_API_KEY;
const PORT = process.env.PORT || 8000;

// Create MCP server logic instance
const mcpLogic = new McpServer({
  name: "ts-multi-tool-server",
  version: "0.1.0",
  description: "Provides weather and geocoding tools via public APIs",
});

// --- Tool Definitions (Keep as before) --- //
const weatherRawShape = {
  location: z.string().describe("The city and state/country, e.g., \"San Francisco, CA\" or \"London, UK\""),
  units: z.enum(["metric", "imperial", "standard"]).optional().default("metric").describe("Units for temperature (metric=Celsius, imperial=Fahrenheit, standard=Kelvin). Defaults to metric."),
};
const weatherSchema = z.object(weatherRawShape);
type WeatherParams = z.infer<typeof weatherSchema>;
mcpLogic.tool(
  "get_current_weather",
  weatherRawShape,
  async (params: WeatherParams): Promise<{ content: { type: "text", text: string }[] }> => {
    console.log(`Executing get_current_weather with params:`, params);
    const { location, units } = params;
    if (!OPENWEATHERMAP_API_KEY) throw new Error("Server configuration error: Weather API key missing.");
    const apiUrl = "http://api.openweathermap.org/data/2.5/weather";
    const apiParams = { q: location, appid: OPENWEATHERMAP_API_KEY, units: units };
    try {
      const response = await axios.get(apiUrl, { params: apiParams });
      const data = response.data;
      if (data.cod != 200) throw new Error(`Weather API error: ${data.message || "Unknown error"}`);
      const mainWeather = data.weather?.[0] || {};
      const mainTemp = data.main || {};
      const result = { location_found: data.name, description: mainWeather.description, temperature: mainTemp.temp, feels_like: mainTemp.feels_like, humidity_percent: mainTemp.humidity, wind_speed: data.wind?.speed, units: units };
      console.log(`Successfully fetched weather for '${location}'`);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error: any) { throw new Error(`Failed to get weather: ${error.message || error}`); }
  }
);
const geocodingRawShape = {
  query: z.string().describe("The place name or address to search for, e.g., \"Eiffel Tower\""),
};
const geocodingSchema = z.object(geocodingRawShape);
type GeocodingParams = z.infer<typeof geocodingSchema>;
mcpLogic.tool(
  "find_location_info",
  geocodingRawShape,
  async (params: GeocodingParams): Promise<{ content: { type: "text", text: string }[] }> => {
    console.log(`Executing find_location_info with params:`, params);
    const { query } = params;
    const apiUrl = "https://nominatim.openstreetmap.org/search";
    const apiParams = { q: query, format: "json", limit: 1 };
    const headers = { "User-Agent": "ts-mcp-server-demo/0.1 (Contact: your-email@example.com)" };
    try {
      const response = await axios.get(apiUrl, { params: apiParams, headers: headers });
      const data = response.data;
      if (!data || data.length === 0) throw new Error(`No results found for '${query}'`);
      const topResult = data[0];
      const result = { place_id: topResult.place_id, licence: topResult.licence, osm_type: topResult.osm_type, osm_id: topResult.osm_id, boundingbox: topResult.boundingbox, latitude: topResult.lat, longitude: topResult.lon, display_name: topResult.display_name, class: topResult.class, type: topResult.type, importance: topResult.importance };
      console.log(`Successfully geocoded query: '${query}'`);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error: any) { throw new Error(`Failed during geocoding: ${error.message || error}`); }
  }
);

// --- Express + SSE Server Setup --- //

console.log("Setting up Express server...");
const app = express();

// Apply CORS middleware BEFORE routes
app.use(cors({ origin: '*' })); // Allow all origins for simplicity, adjust for production

const transports: { [sessionId: string]: SSEServerTransport } = {};

// SSE endpoint for clients to connect
app.get("/sse", async (req: Request, res: Response) => {
  console.log("SSE connection requested");
  try {
    const sessionId = randomUUID();
    console.log(`Creating SSE transport for sessionId: ${sessionId}`);
    // Corrected SSEServerTransport constructor (removed sessionId)
    const transport = new SSEServerTransport('/messages', res);
    // The transport likely manages its own sessionId internally now.
    // We need a way to retrieve it to store in our map.
    // Assuming transport.sessionId exists after instantiation:
    const transportSessionId = transport.sessionId; // Get session ID from transport
    transports[transportSessionId] = transport;
    console.log(`Transport stored with actual sessionId: ${transportSessionId}`);

    req.on("close", () => {
      console.log(`SSE connection closed for sessionId: ${transportSessionId}`);
      delete transports[transportSessionId];
      // transport.close(); // Transport might autoclose on req close
    });

    await mcpLogic.connect(transport);
    console.log(`mcpLogic connected to transport for sessionId: ${transportSessionId}`);

  } catch (error) {
    console.error("Error setting up SSE connection:", error);
    if (!res.headersSent) {
        res.status(500).send('Failed to establish SSE connection');
    }
  }
});

// Endpoint for clients to send messages to the server
app.post("/messages", async (req: Request, res: Response): Promise<void> => {
  // Session ID should be provided by the transport/client, often in URL
  const sessionId = req.query.sessionId as string;
  console.log(`Received POST message for sessionId: ${sessionId}`);
  console.log(`Current known transport sessionIds: ${Object.keys(transports).join(', ')}`);

  if (!sessionId) {
    res.status(400).send('Missing sessionId query parameter');
    return;
  }

  const transport = transports[sessionId];
  if (transport) {
    try {
      // Corrected handlePostMessage arguments: pass req and res
      await transport.handlePostMessage(req, res);
      // Transport handles the response, so we don't send one here
    } catch (error) {
      console.error(`Error handling POST message for sessionId ${sessionId}:`, error);
      // Avoid sending response if transport already did or headers sent
      if (!res.headersSent) {
          res.status(500).send('Error processing message');
      }
      // No return here, error is handled
    }
  } else {
    console.warn(`No active transport found for sessionId: ${sessionId}`);
    res.status(404).send('No active session found for sessionId');
    // No return here
  }
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.status(200).send("OK");
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`MCP Server with Express listening on http://localhost:${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`Message endpoint: http://localhost:${PORT}/messages`);
});
