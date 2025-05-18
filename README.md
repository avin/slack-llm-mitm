# Slack Proxy with LLM Message Processing

A local HTTP MITM proxy that intercepts Slack's `chat.postMessage` API requests and routes message content through a configurable LLM.

## Features

- Intercepts outgoing Slack chat messages  
- Processes message blocks using any LLM prompt you choose  
- Fully configurable system prompt for grammar correction, translation, summarization, or custom workflows  

## Prerequisites

- Node.js v14 or higher  
- An API key for an OpenAI-compatible LLM

## Configuration

1. Copy the example environment file:  
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` (see the description of options below)

## Usage

Start the proxy server:

```bash
npm install
npm start
```

Point your Slack client or HTTP settings to use proxy.

```sh
slack.exe --proxy-server="http://127.0.0.1:8000"
```

## Environment Variables

| Variable               | Description                                                                 |
|------------------------|-----------------------------------------------------------------------------|
| `OPENAI_API_KEY`       | **(Required)** Your LLM API key                                             |
| `OPENAI_API_MODEL`     | Model to use for processing (e.g. `gpt-4.1-mini-2025-04-14`)                |
| `OPENAI_API_URL`       | Base URL for the LLM API                                                     |
| `OPENAI_SYSTEM_PROMPT` | System prompt guiding message processing (customizable by the user)          |
| `PROXY_PORT`           | Port on which the proxy listens (default: `8000`)                            |

## How It Works

1. The proxy intercepts HTTP requests to Slack’s `chat.postMessage` endpoint.  
2. It parses data and extracts message blocks.  
3. Extracted text is sent to the LLM using your system prompt.  
4. Processed text replaces the original content before forwarding to Slack.

## License

MIT