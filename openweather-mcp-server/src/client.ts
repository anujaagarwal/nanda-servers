import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"; // Use SSE instead
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"; // Import SSE Client Transport
import * as process from 'process';

// Basic client implementation to test the SSE server

async function runClient() {
  console.log("Starting MCP client test (SSE against deployed service)...");

  // Point to the deployed App Runner URL
  const serverBaseUrl = `https://z3neqkdrhv.us-east-1.awsapprunner.com`;
  const sseUrl = `${serverBaseUrl}/sse`;
  // const messageUrl = `${serverBaseUrl}/messages`; // messageUrl is discovered from server event

  const transport = new SSEClientTransport(new URL(sseUrl));

  const client = new Client(
    {
      name: "ts-sse-client",
      version: "0.1.0"
    },
    {
      capabilities: {}
    }
  );

  try {
    // Connect to the server via SSE
    console.log(`Connecting client to server via SSE at ${serverBaseUrl}...`);
    await client.connect(transport);
    console.log("Client connected.");

    // Initialization is implicit with connect/first request in SSE transport

    // List tools
    console.log("\nListing available tools...");
    const toolsList = await client.listTools();
    console.log("Server Capabilities:", JSON.stringify(client.getServerCapabilities() ?? {}, null, 2));
    console.log("Tools available:", JSON.stringify(toolsList.tools, null, 2));

    // Call Weather tool
    console.log("\nCalling get_current_weather...");
    const weatherArgs = { location: "Tokyo, Japan", units: "metric" as const };
    const weatherResult = await client.callTool({ name: "get_current_weather", arguments: weatherArgs });
    console.log("Weather Result:", JSON.stringify(weatherResult, null, 2));
    const weatherResultAny = weatherResult as any;
    if(weatherResultAny.content?.[0]?.type === 'text') {
        try {
            console.log("Parsed Weather Content:", JSON.parse(weatherResultAny.content[0].text));
        } catch { /* Ignore parse error if not JSON */ }
    }

    // Call Geocoding tool
    console.log("\nCalling find_location_info...");
    const geoArgs = { query: "Statue of Liberty" };
    const geoResult = await client.callTool({ name: "find_location_info", arguments: geoArgs });
    console.log("Geocoding Result:", JSON.stringify(geoResult, null, 2));
    const geoResultAny = geoResult as any;
    if(geoResultAny.content?.[0]?.type === 'text') {
        try {
            console.log("Parsed Geocoding Content:", JSON.parse(geoResultAny.content[0].text));
        } catch { /* Ignore parse error if not JSON */ }
    }


  } catch (error) {
    console.error("\nClient encountered an error:", error);
  } finally {
    // Close the connection
    console.log("\nClosing client connection...");
    await client.close();
    console.log("Client finished.");
  }
}

runClient(); 