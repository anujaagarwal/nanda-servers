#!/usr/bin/env node

// Ref: https://modelcontextprotocol.io/quickstart

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import express, { Request, Response } from "express";
import path from "path";

const PORT_NUMBER = 8080;
const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";

// Define Zod schemas for validation
const AlertsArgumentsSchema = z.object({
  state: z.string().length(2),
});

const ForecastArgumentsSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

// Create server instance
const server = new Server(
  {
    name: "weather",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get-alerts",
        description: "Get weather alerts for a US state",
        inputSchema: {
          type: "object",
          properties: {
            state: {
              type: "string",
              description: "Two-letter US state code (e.g. CA, NY)",
            },
          },
          required: ["state"],
        },
      },
      {
        name: "get-forecast",
        description: "Get weather forecast for a location in the US",
        inputSchema: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              description: "Latitude of the location",
            },
            longitude: {
              type: "number",
              description: "Longitude of the location",
            },
          },
          required: ["latitude", "longitude"],
        },
      },
    ],
  };
});

// Helper function for making NWS API requests
async function makeNWSRequest<T>(url: string): Promise<T | null> {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/geo+json",
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making NWS request:", error);
    return null;
  }
}

interface AlertFeature {
  properties: {
    event?: string;
    areaDesc?: string;
    severity?: string;
    status?: string;
    headline?: string;
  };
}

// Format alert data
function formatAlert(feature: AlertFeature): string {
  const props = feature.properties;
  return [
    `Event: ${props.event || "Unknown"}`,
    `Area: ${props.areaDesc || "Unknown"}`,
    `Severity: ${props.severity || "Unknown"}`,
    `Status: ${props.status || "Unknown"}`,
    `Headline: ${props.headline || "No headline"}`,
    "---",
  ].join("\n");
}

interface ForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
}

interface AlertsResponse {
  features: AlertFeature[];
}

interface PointsResponse {
  properties: {
    forecast?: string;
  };
}

interface ForecastResponse {
  properties: {
    periods: ForecastPeriod[];
  };
}

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "get-alerts") {
      const { state } = AlertsArgumentsSchema.parse(args);
      const stateCode = state.toUpperCase();

      const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
      const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);

      if (!alertsData) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to retrieve alerts data",
            },
          ],
        };
      }

      const features = alertsData.features || [];
      if (features.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No active alerts for ${stateCode}`,
            },
          ],
        };
      }

      const formattedAlerts = features.map(formatAlert).slice(0, 20); // only take the first 20 alerts;
      const alertsText = `Active alerts for ${stateCode}:\n\n${formattedAlerts.join(
        "\n"
      )}`;

      return {
        content: [
          {
            type: "text",
            text: alertsText,
          },
        ],
      };
    } else if (name === "get-forecast") {
      const { latitude, longitude } = ForecastArgumentsSchema.parse(args);

      // Get grid point data
      const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(
        4
      )},${longitude.toFixed(4)}`;
      const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);

      if (!pointsData) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve grid point data for coordinates: ${latitude}, ${longitude}. This location may not be supported by the NWS API (only US locations are supported).`,
            },
          ],
        };
      }

      const forecastUrl = pointsData.properties?.forecast;
      if (!forecastUrl) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to get forecast URL from grid point data",
            },
          ],
        };
      }

      // Get forecast data
      const forecastData = await makeNWSRequest<ForecastResponse>(forecastUrl);
      if (!forecastData) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to retrieve forecast data",
            },
          ],
        };
      }

      const periods = forecastData.properties?.periods || [];
      if (periods.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No forecast periods available",
            },
          ],
        };
      }

      // Format forecast periods
      const formattedForecast = periods.map((period: ForecastPeriod) =>
        [
          `${period.name || "Unknown"}:`,
          `Temperature: ${period.temperature || "Unknown"}°${
            period.temperatureUnit || "F"
          }`,
          `Wind: ${period.windSpeed || "Unknown"} ${
            period.windDirection || ""
          }`,
          `${period.shortForecast || "No forecast available"}`,
          "---",
        ].join("\n")
      );

      const forecastText = `Forecast for ${latitude}, ${longitude}:\n\n${formattedForecast.join(
        "\n"
      )}`;

      return {
        content: [
          {
            type: "text",
            text: forecastText,
          },
        ],
      };
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid arguments: ${error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ")}`
      );
    }
    throw error;
  }
});

// Express app and SSE setup
const app = express();

// to support multiple simultaneous connections we have a lookup object from
// sessionId to transport
const transports: { [sessionId: string]: SSEServerTransport } = {};

// Add a counter to track the number of hits to the /messages endpoint
let messageHitCount = 0;

// Serve a simple HTML page with client-side code to connect to SSE
app.get("/", (_: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>MCP Weather Server</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        #output { margin-top: 20px; padding: 10px; border: 1px solid #ccc; }
      </style>
    </head>
    <body>
      <h1>MCP Weather Server</h1>
      <p>Server is running correctly!</p>
      <button id="connectBtn">Connect to SSE</button>
      <div id="output">Connection status will appear here...</div>

      <script>
        document.getElementById('connectBtn').addEventListener('click', () => {
          const output = document.getElementById('output');
          output.textContent = 'Connecting to SSE...';

          const evtSource = new EventSource('/sse');

          evtSource.onopen = () => {
            output.textContent += '\\nConnected to SSE!';
          };

          evtSource.onerror = (err) => {
            output.textContent += '\\nError with SSE connection: ' + JSON.stringify(err);
            evtSource.close();
          };

          evtSource.onmessage = (event) => {
            output.textContent += '\\nReceived: ' + event.data;
          };
        });
      </script>
    </body>
    </html>
  `);
});

// Test endpoint to verify server is working
app.get("/api/test", (_: Request, res: Response) => {
  res.json({ status: "ok", message: "Weather Server is working!" });
});

// SSE endpoint for MCP communication
app.get("/sse", async (req: Request, res: Response) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  res.on("close", () => {
    delete transports[transport.sessionId];
  });
  await server.connect(transport);
});

app.post("/messages", async (req: Request, res: Response) => {
  // Increment the counter
  messageHitCount++;

  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No transport found for sessionId");
  }
});

// Add an endpoint to retrieve the hit count
app.get("/messages/hit-count", (_: Request, res: Response) => {
  res.json({ hitCount: messageHitCount });
});

// Start the server
async function main() {
  console.log(`Weather MCP Server starting on http://localhost:${PORT_NUMBER}`);
  app.listen(PORT_NUMBER, () => {
    console.log(
      `Weather MCP Server running on http://localhost:${PORT_NUMBER}`
    );
  });
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
