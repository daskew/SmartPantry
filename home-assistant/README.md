# SmartPantry Home Assistant Integration

Modular Home Assistant configuration for SmartPantry. Built to expand as you add new features.

---

## 📁 Structure

```
home-assistant/
├── sensors/           # REST API sensors (one file per feature)
│   ├── pantry.yaml    # ✅ Active: Pantry items
│   ├── recipes.yaml   # 🔜 Future: Recipe tracking
│   └── shopping.yaml  # 🔜 Future: Shopping list
│
├── dashboards/        # Dashboard cards (one file per feature)
│   ├── main.yaml      # Master dashboard (includes all)
│   ├── pantry.yaml    # ✅ Active: Pantry view
│   └── recipes.yaml   # 🔜 Future: Recipes view
│
├── automations/       # Automation rules
│   └── pantry.yaml    # ✅ Active: Expiry notifications
│
└── README.md         # This file
```

---

## 🚀 Quick Setup

### 1. Add Sensors

In your `configuration.yaml`:

```yaml
# Load all sensor files
sensor: !include_dir_merge_list sensors/

# Load template sensors
template: !include_dir_merge_list_list sensors/
```

Or paste `sensors/pantry.yaml` contents directly.

### 2. Restart Home Assistant

```bash
ha core restart
```

### 3. Add Dashboard

In Home Assistant UI:
1. **Dashboards** → **Add Card** → **Manual**
2. Paste content from `dashboards/pantry.yaml`

Or use **Raw Configuration Editor** for YAML mode.

---

## ➕ Adding New Features

When you build new features into SmartPantry, here's how to add them to Home Assistant:

### Step 1: Add API Endpoint
In your SmartPantry backend, create `app/api/<feature>/route.ts`

### Step 2: Create Sensor
Create `sensors/<feature>.yaml`:
```yaml
- platform: rest
  name: "SmartPantry FeatureName"
  unique_id: "smart_pantry_feature"
  resource: "https://smartpantry.vercel.app/api/feature"
  scan_interval: 300
  value_template: "{{ value_json.data | length }}"
  json_attributes:
    - data
  headers:
    Content-Type: "application/json"
```

### Step 3: Create Dashboard Card
Create `dashboards/<feature>.yaml` with your UI components

### Step 4: Include in Main Dashboard
Update `dashboards/main.yaml` to include the new feature

---

## 🔜 Planned Features

| Feature | Sensor File | Dashboard File | Status |
|---------|-------------|----------------|--------|
| Pantry Items | `pantry.yaml` | `pantry.yaml` | ✅ Ready |
| Recipes | `recipes.yaml` | `recipes.yaml` | 🔜 Ready to enable |
| Shopping List | `shopping.yaml` | - | 🔜 Ready to enable |
| Family Ratings | `ratings.yaml` | - | 📋 To be created |
| Meal Planning | `meals.yaml` | - | 📋 To be created |

---

## 🎛️ Voice Control

Once set up, you can say:
- "Hey Google, ask Home Assistant how many items are in the pantry"
- "Hey Google, show the pantry dashboard" (on Nest Hub)

---

## 🔧 Troubleshooting

**Sensor not loading?**
- Check your Vercel deployment is live
- Verify the API URL in the sensor config

**Need API authentication?**
- Let me know and I'll add API key support to the endpoints

**Dashboard not showing?**
- Ensure you've added the sensor first
- Check Home Assistant logs for errors

---

## 📞 Need Help?

Ask me! I can help you:
- Add new features to the HA integration
- Debug sensor issues
- Create custom automations
- Build more complex dashboards
