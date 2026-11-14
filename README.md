<div align="center">

# ✈️ PreFlight AI

**Drop in any company’s URL and generate a live, brand-matched Voice & Chat AI prototype, a Top-10 automation blueprint, and a CFO-ready contact-center ROI case in 60 seconds.**

[![Next.js](https://img.shields.io/badge/Frontend-Next.js%20%7C%20TypeScript-000000?style=flat-square&logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/Backend-Python%20%7C%20FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/Vector%20Store-PostgreSQL%20%2B%20pgvector-336791?style=flat-square&logo=postgresql)](https://github.com/pgvector/pgvector)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

</div>

---

## 🎯 Why PreFlight AI?

Enterprise conversational AI deals rarely stall because the underlying LLM isn't smart enough—**they stall in Pre-Sales and Discovery.**

Today, when a Solutions Engineer (SE) or Account Executive (AE) pitches a large enterprise or BPO operator, it takes **2 to 3 weeks of manual effort** to audit their help center, map high-volume intents, calculate call-deflection ROI, and build a custom proof-of-concept demo.

**PreFlight AI compresses a 3-week pre-sales cycle into a 60-second automated pipeline**—giving outbound reps an interactive, prospect-branded demo to attach to cold outreach and eliminating manual POC setup for Solutions Engineering.

---

## ⚡ The 60-Second Experience

### 1. Single-Input Trigger
Enter any target company’s domain (e.g., `noon.com`, `aramex.com`, or a regional bank/telecom) and select target channels (**Web Chat**, **WhatsApp**, or **Voice / IVR**).

### 2. Live Streaming Ingestion Pipeline (30–60s)
A real-time Server-Sent Events (SSE) progress feed shows the system:
- Crawling public help centers, sitemaps, `/faq`, `/returns`, and `/pricing` pages
- Extracting brand assets (logo, favicon, and dominant CSS hex colors)
- Mining public customer reviews for support friction
- Indexing policies and generating mock industry API tools

### 3. Shareable Prospect Microsite (`app.preflight.ai/d/<company>`)
Outputs an executive-ready workspace with **four interactive modules**:

| Module | What It Delivers | Why Buyers Care |
| :--- | :--- | :--- |
| **1. Automation Opportunity Matrix** | Ranks the prospect's **Top 10 Automation Workflows** by estimated ticket volume, complexity (`RAG-Only` vs. `API Tool-Call`), and optimal channel (`Voice` vs. `WhatsApp`). | Proves deep domain understanding immediately without a 2-hour discovery call. |
| **2. Live Grounded Voice & Chat Sandbox** | A working, brand-themed AI agent pre-trained on actual policies, complete with **source citations**, **live latency inspector**, and **simulated backend actions** (e.g., Order Tracking, Refund Eligibility). | Buyers don't want slides—they want to test how an agent handles their toughest customer questions on the spot. |
| **3. External Friction Audit** | Scrapes public reviews (Trustpilot, App Store, Reddit) to surface real support complaints (e.g., *"40-minute hold times for flight rebooking"*) paired with an instant AI fix. | Creates immediate urgency for a VP of CX or BPO leader. |
| **4. Interactive BPO / Deflection ROI Model** | Editable sliders for monthly call/chat volume, Average Handle Time (AHT), and human vs. AI resolution cost—generating an exportable business case. | Gives internal champions the exact numbers required for CFO budget sign-off. |

---

## 🏗️ System Architecture

PreFlight AI is engineered as an asynchronous, multi-agent ingestion and runtime pipeline rather than a fragile single-prompt wrapper:

```mermaid
flowchart LR
    A[Target Domain URL] --> B[FastAPI Orchestrator]
    B --> C[Crawl4AI / Firecrawl]
    B --> D[Tavily Review Intel]
    B --> E[Brand Asset Extractor]
    C & D & E --> F[LLM Extraction Pipeline]
    F --> G[(PostgreSQL + pgvector)]
    G --> H[Next.js Prospect Microsite]
    H --> I[Grounded Chat & WebRTC Voice Sandbox]
