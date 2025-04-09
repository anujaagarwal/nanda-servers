# TypeScript MCP Server (Weather & Geocoding)

This project provides a Model Context Protocol (MCP) server built with TypeScript. It allows MCP clients (like AI assistants or other applications) to fetch current weather data and geocoding information using public APIs.

## Prerequisites

*   Node.js (v18 or later recommended)
*   npm (usually included with Node.js)
*   An [OpenWeatherMap API Key](https://openweathermap.org/appid)

## Running Locally

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Set up API Key:**
    *   Copy the example environment file: `cp .env.example .env`
    *   Edit the `.env` file and add your OpenWeatherMap API key:
      ```dotenv
      OPENWEATHERMAP_API_KEY=your_actual_key_here
      ```
4.  **Run the server:**
    ```bash
    npm run dev
    ```
    The server will start using `ts-node` and listen for connections on `http://localhost:8000`. It uses Server-Sent Events (SSE) for communication.

## Testing Locally (Easy Method)

The easiest way to test the running server without writing code is using the included HTML test page:

1.  Ensure the server is running locally (`npm run dev`).
2.  Open the `index.html` file (located in the project root) directly in your web browser.
3.  In the "Server Base URL" field, ensure it says `http://localhost:8000`.
4.  Click the **"Connect SSE"** button. The status should change to "Connected & Ready".
5.  **To test Weather:**
    *   Tool Name: `get_current_weather`
    *   Tool Arguments (JSON): `{ "location": "London, UK" }` (or another city/country)
    *   Click **"Send tools/call Request"**.
6.  **To test Geocoding:**
    *   Tool Name: `find_location_info`
    *   Tool Arguments (JSON): `{ "query": "Eiffel Tower" }` (or another place name)
    *   Click **"Send tools/call Request"**.
7.  Results from the server will appear in the "Logs / Server Responses" box on the page.

## Available Tools

The server currently exposes the following tools for MCP clients:

1.  **`get_current_weather`**
    *   **Description:** Fetches the current weather conditions for a specified location.
    *   **Arguments:**
        *   `location` (string, **required**): The city and state/country (e.g., `"San Francisco, CA"`, `"London, UK"`, `"Boston, US"`).
        *   `units` (string, *optional*, default: `"metric"`): Units for temperature. Options: `"metric"` (Celsius), `"imperial"` (Fahrenheit), `"standard"` (Kelvin).
    *   **Example JSON Arguments:** `{ "location": "Tokyo, Japan", "units": "metric" }`

2.  **`find_location_info`**
    *   **Description:** Finds address details and coordinates for a given place name using OpenStreetMap Nominatim.
    *   **Arguments:**
        *   `query` (string, **required**): The place name or address to search for (e.g., `"Eiffel Tower"`, `"Statue of Liberty"`).
    *   **Example JSON Arguments:** `{ "query": "Golden Gate Bridge" }`

## Example Client Queries

An AI assistant integrated with this server could potentially handle requests like:

*   "What's the current temperature in Berlin using metric units?" (Uses `get_current_weather`)
*   "Fetch the weather for Oslo, Norway." (Uses `get_current_weather`)
*   "Where is the Brandenburg Gate located?" (Uses `find_location_info`)
*   "Get location details for Mount Fuji." (Uses `find_location_info`)

## Deployment Guide (AWS App Runner)

This server is containerized using the included `Dockerfile` and can be deployed to services like AWS App Runner.

1.  **Build the Docker Image:** Ensure Docker is running. Build the image for the correct platform:
    ```bash
    docker build --platform linux/amd64 -t your-image-name .
    ```
    *(Replace `your-image-name` with a suitable tag like `ts-mcp-server-weather-geo`)*
2.  **Push Image to ECR:**
    *   Create a private AWS ECR repository (e.g., `your-image-name`) in your desired region.
    *   Authenticate Docker with ECR (`aws ecr get-login-password ... | docker login ...`).
    *   Tag your image with the full ECR URI: `docker tag your-image-name:latest <account_id>.dkr.ecr.<region>.amazonaws.com/your-image-name:latest`.
    *   Push the image: `docker push <account_id>.dkr.ecr.<region>.amazonaws.com/your-image-name:latest`.
3.  **Create App Runner Service:**
    *   In the App Runner console, create a new service.
    *   Source: Container registry, pointing to your ECR image.
    *   Deployment: Automatic (recommended). Create a new ECR access role.
    *   Configure Service:
        *   Set **Port** to `8000`.
        *   Add **Environment Variable:** `OPENWEATHERMAP_API_KEY` = `your_actual_key_here`. **Do not hardcode keys!**
        *   Configure **Health Check:** Use HTTP protocol on path `/health`.
    *   Create and deploy the service.
4.  **Test:** Use the provided App Runner URL (HTTPS) with the `index.html` test page or another MCP client.

## Project Structure

*   `src/server.ts`: Main server logic (Express, McpServer, Tools, SSE).
*   `src/client.ts`: Example testing client (uses SSE).
*   `index.html`: Browser-based test client (uses SSE).
*   `Dockerfile`: Builds the production container image.
*   `package.json` / `package-lock.json`: Node dependencies.
*   `tsconfig.json`: TypeScript configuration.
*   `.env.example`: Example environment file.
*   `.gitignore`: Git ignore configuration.

## Technologies Used

*   Node.js, TypeScript
*   `@modelcontextprotocol/sdk`
*   Express.js, SSE
*   `zod`, `axios`, `dotenv`, `cors`
*   OpenWeatherMap API, OpenStreetMap Nominatim API
*   Docker, AWS App Runner, AWS ECR