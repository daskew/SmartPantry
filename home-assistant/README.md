# SmartPantry Home Assistant Integration

This folder contains everything you need to add SmartPantry to your Home Assistant dashboard.

## Quick Setup

### 1. Add REST Sensor

Add this to your `configuration.yaml`:

```yaml
sensor:
  - platform: rest
    name: SmartPantry Items
    unique_id: smart_pantry_items
    resource: https://smartpantry.vercel.app/api/pantry
    scan_interval: 300
    value_template: "{{ value_json.items | length }}"
    json_attributes:
      - items
    headers:
      Content-Type: "application/json"
```

**For expiring items only:**
```yaml
sensor:
  - platform: rest
    name: SmartPantry Expiring
    unique_id: smart_pantry_expiring
    resource: https://smartpantry.vercel.app/api/pantry?expiring=7
    scan_interval: 300
    value_template: "{{ value_json.items | length }}"
    json_attributes:
      - items
```

### 2. Add to Dashboard (GUI)

1. Open Home Assistant → **Dashboards**
2. Click **"Add Card"** → **"Entities"**
3. Select the `sensor.smart_pantry_items` entity
4. Customize the name and icon

Or use the YAML below...

### 3. Full Dashboard YAML

Create a new dashboard or add to existing:

```yaml
title: Smart Pantry
views:
  - title: Pantry
    cards:
      - type: entities
        title: Expiring Soon
        show_header_toggle: false
        entities:
          - entity: sensor.smart_pantry_expiring
            name: Items Expiring This Week
            icon: mdi:alert-circle

      - type: custom:stack-in-card
        cards:
          - type: horizontal-stack
            cards:
              - type: entity
                entity: sensor.smart_pantry_items
                name: Total Items
                icon: mdi:fridge

      - type: markdown
        title: Pantry Contents
        content: >
          {% if state_attr('sensor.smart_pantry_items', 'items') %}
            {% set items = state_attr('sensor.smart_pantry_items', 'items') %}
            {% for item in items %}
            - {{ item.quantity }}x {{ item.name }} - Expires {{ item.expiration_date }}
            {% endfor %}
          {% else %}
            No items in pantry
          {% endif %}
```

---

## API Endpoints Reference

| Endpoint | Description |
|----------|-------------|
| `GET /api/pantry` | All items |
| `GET /api/pantry?expiring=7` | Items expiring in 7 days |

---

## Voice Commands (via Home Assistant)

Once set up, you can say:
- "Hey Google, ask Home Assistant how many items are in the pantry"
- "Hey Google, show the pantry dashboard" (if added to overview)

---

## Automations Ideas

### Expiring Soon Notification
```yaml
automation:
  - alias: "Pantry Items Expiring Soon"
    trigger:
      - platform: time
        at: "09:00:00"
    condition:
      - condition: template
        value_template: "{{ state_attr('sensor.smart_pantry_expiring', 'items') | length > 0 }}"
    action:
      - service: notify.mobile_app_your_phone
        data:
          title: "Pantry Alert"
          message: "{{ state_attr('sensor.smart_pantry_expiring', 'items') | length }} items expiring this week!"
```

---

## Troubleshooting

1. **Sensor not loading?** Check the URL is correct and your Vercel deployment is live
2. **CORS errors?** The API already allows all origins, should work
3. **Need auth?** Let me know and I can add API key support

---

## Custom Card (Optional)

For a better visual, install **"Card Mod"** and **"Stack in Card"** from HACS, then use the YAML above.

Need help? Let me know what questions come up! 🌀
