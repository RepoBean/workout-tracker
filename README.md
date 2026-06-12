# 🏋️ Workout Tracker V2

A **self-hosted workout tracker** that's designed to be flexible — just type in whatever exercise you want, and it'll track it. No rigid exercise databases, no predefined lists. If you do it at the gym, you can log it.

| Light Mode | Dark Mode |
|:---:|:---:|
| ![Dashboard Light](screenshots/dashboard-light.png) | ![Dashboard Dark](screenshots/dashboard-dark.png) |

## ✨ Features

- **Fully flexible exercise tracking** — type any exercise name and it's tracked. No restrictions.
- **Custom programs** — build workout routines with exercises, sets, reps, and supersets
- **Active workout session** — guided workout flow with rest timers and set logging
- **RPE & notes per exercise** — prompted after each exercise for perceived effort plus optional notes ("felt strong", "left elbow tweaky"), with edit/clear UI to fix entries on the fly
- **Smart previous-set hints** — when you start a set, you see the weight, reps, *and last RPE* from your previous session so you know exactly how hard it felt last time
- **Avg RPE summaries** — completion celebration and every history card surface average RPE, so you can spot when a session was unusually hard or easy at a glance
- **Progress analytics** — exercise progress charts, volume trends, and personal records
- **Cardio exercises** — log runs, rides, and rows with a live timer or manual duration + distance entry
- **Live heart rate** — connect a Bluetooth HR strap (Web Bluetooth) for a live BPM/zone badge, in-session chart, and per-set HR stats
- **Cardio analytics & HR zones** — time-in-zone summaries on completion and in your history
- **In-session PR toasts** — get notified immediately when you hit a new personal record
- **Auto-progression hints** — opt-in double progression: top the rep range on every working set and the app suggests next session's weight bump
- **AI coach (bring your own key)** — opt-in chat coach that reads your training data and drafts programs you can import in one tap; works with Anthropic, OpenAI, OpenRouter, Google AI Studio, or any OpenAI-compatible endpoint
- **Mid-workout flexibility** — add or swap exercises on the fly without touching your program definition
- **Plate calculator** — see exactly which plates to load per side for any target weight
- **User profile** — configure your heart rate zones and application settings
- **Workout history** — browse past sessions, view details, and export to CSV
- **Workout calendar** — monthly view with workout frequency at a glance
- **Ad-hoc workouts** — jump into a quick session without a program
- **Modern UI system** — brand new typography (DM Sans + Outfit), slick gradient hero cards, and reactive Light/Dark mode themes
- **Bottom navigation** — easy one-handed gym usage with an intuitive mobile-friendly fixed tab bar
- **Offline indicator** — a clear banner when connectivity drops, with already-loaded data still visible

## 🤖 LLM-Friendly Workflow

There are two ways to put an LLM to work on your training:

### Built-in AI Coach

Enable the AI Coach in Settings, plug in your own API key (Anthropic, OpenAI, OpenRouter, Google AI Studio, or any OpenAI-compatible endpoint), and chat with a coach that has **read-only** access to your programs, history, and stats. Ask it to review your week, spot stalls, or build a new program — drafted programs drop straight into the standard import preview, so nothing touches your data without your confirmation. Your key and conversation stay in your browser.

### Manual export/import

The import/export features also play nicely with any external LLM:

1. **Build a program** in the app
2. **Export it as JSON** and paste it into ChatGPT, Claude, etc. for analysis and suggestions
3. **Import the updated JSON** right back into the app — no manual re-entry
4. **Export workout history as CSV** and feed it to an LLM to spot trends, suggest deloads, or adjust programming

The structured data formats make it easy for any LLM to parse and reason about your training.

## 📸 Screenshots

<details>
<summary>Click to expand</summary>

### Programs
| Light Mode | Dark Mode |
|:---:|:---:|
| ![Programs Light](screenshots/programs-light.png) | ![Programs Dark](screenshots/programs-dark.png) |

### Progress
| Light Mode | Dark Mode |
|:---:|:---:|
| ![Progress Light](screenshots/progress-light.png) | ![Progress Dark](screenshots/progress-dark.png) |

### History
| Light Mode | Dark Mode |
|:---:|:---:|
| ![History Light](screenshots/history-light.png) | ![History Dark](screenshots/history-dark.png) |

</details>

## 🛠️ Tech Stack

| Layer    | Tech                                  |
|----------|---------------------------------------|
| Frontend | React 19, TypeScript, Vite, Tailwind  |
| Backend  | Express 5, Sequelize, TypeScript      |
| Database | SQLite                                |
| Deploy   | Docker, Nginx                         |

## 🚀 Installation

### Option 1: Docker (Recommended)

The easiest way to get up and running.

```bash
# Clone the repo
git clone https://github.com/RepoBean/workout-tracker.git
cd workout-tracker

# Copy the example env file
cp .env.example .env

# Build and start
docker compose up -d
```

The app will be available at **http://localhost:8035**.

### Option 2: Local Development

```bash
# Clone the repo
git clone https://github.com/RepoBean/workout-tracker.git
cd workout-tracker

# Install all dependencies (root + backend + frontend)
npm run install:all

# Start both servers in dev mode
npm run dev
```

This starts:
- **Frontend** at `http://localhost:5174`
- **Backend** at `http://localhost:3002`

Alternatively, you can use the provided shell script:

```bash
# Make the start script executable
chmod +x start-dev.sh

# Run it
./start-dev.sh
```

(`start.sh` is the production variant — it builds both apps and serves the compiled output.)

## 🌐 Accessing from the Gym

Since this is a self-hosted app running on your local network, you'll need a way to reach it when you're out at the gym. The easiest approach is to use a **VPN** (like WireGuard or Tailscale) to connect back to your home network. Once connected, just hit your server's local IP and port — for example:

```
http://192.168.1.100:8035
```

> [!TIP]
> [Tailscale](https://tailscale.com/) is a great zero-config option — install it on your server and phone, and you can access the app from anywhere without fiddling with port forwarding.

## 📁 Project Structure

```
workout-tracker-v2/
├── frontend/            # React + Vite frontend
│   └── src/
│       ├── features/    # Dashboard, Programs, Progress, History, Active Session, Settings, AI Coach
│       └── shared/      # Shared UI components, hooks, context
├── backend/             # Express API server
│   └── src/
│       ├── models/      # Sequelize models (SQLite)
│       └── routes/      # REST API endpoints
├── docker-compose.yml   # Docker orchestration
├── Dockerfile.backend   # Multi-stage backend build
├── Dockerfile.frontend  # Multi-stage frontend build (Nginx)
├── nginx.conf           # Nginx reverse proxy config
├── start-dev.sh         # Dev start script (both servers)
└── start.sh             # Production build + start script
```

## 🧪 A Vibe Coding Experiment

Full transparency — this entire app was built through vibe coding with AI. The architecture, the components, the API, all of it was pair-programmed with LLMs. It's been a fun experiment in seeing how far you can push a project by describing what you want and iterating on the results. If something looks over-engineered or oddly structured, now you know why. It works, I use it every week, and that's what matters. Open to suggestions.

## 📄 License

MIT
