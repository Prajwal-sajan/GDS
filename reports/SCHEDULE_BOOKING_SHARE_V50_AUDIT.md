# Schedule → Manage → Bookings → Seat Layout → Share (v50)

## Screenshot reference and required behavior

Screenshot: WhatsApp-like green outgoing message with a rich preview for November Travels. The user-supplied exact plaintext is:

```
Hyderabad → Bengaluru on Sun, 22 Nov, 2026 — pick your seat and book: https://novembertravels.com/bus/search/?fromCity=107258&toCity=102257&journeyDate=2026-11-22
```

**v50 implementation:** Clicking **Share** in the left Seat Layout panel retrieves a current, authenticated route/date passenger booking-search link and places the **entire plaintext message** on the system clipboard. Users paste it directly in WhatsApp Web/Desktop, email, SMS, chat, or documents. WhatsApp may fetch its own webpage preview; the GDS does not copy or fake a WhatsApp preview card.

## Configuration — required once per operator

1. Go to **Settings → Configuration → Website** and set **Booking Search URL (HTTPS)**, for example `https://novembertravels.com/bus/search/` **only for an operator whose actual passenger booking website is November Travels**.
2. Save. This field is stored server-side in `config_v30.website.booking_search_url`, not in a hardcoded demo setting. The Settings API requires `settings.modify`.
3. Ensure the passenger website recognizes your GDS's numeric city IDs. The supplied Hyderabad and Bengaluru IDs, `107258` and `102257`, are present in the demo GDS and screenshot. If a production website uses different IDs, they must be mapped before public sharing; v50 does not invent a mapping.
4. Open an active schedule → **Manage → Bookings**, select From/To cities in the left pane, and click **Share**.
5. A URL is formed using the configured HTTPS search base and `fromCity`, `toCity`, `journeyDate` query parameters. Clipboard success is reported only after the browser confirms the write.
6. Paste with Ctrl+V. If clipboard permission or API support is blocked, a modal displays the fully selected, readonly message with a **Copy booking message** button, and supports manual Ctrl+C.

No website is presumed for the seeded **Demo Travels** operator. An unconfigured booking website produces an informative error instead of mistakenly sharing an internal GDS route or another operator's link.

## Data correctness and limitations

| Concern | Rule |
|---|---|
| Current service | Authenticated `GET /api/schedules/:id/booking-share`, validated active schedule and route. |
| Segment chosen in UI | `from_city_id` and `to_city_id` are passed from the currently selected seat layout, validated against ordered `route.via_cities`. No reverse, same-city or off-route links. |
| Destination and origin names | Looked up using actual `D.cityName(city_id)`. |
| Journey date | Uses the service's `travel_date`; if the selected boarding city is Day 2 or later, increments by `route.via_cities[].day - 1` so passengers search on **their own boarding date**. The service's original start date remains available as metadata. |
| Share text | `<From> → <To> on <Day, DD Mon, YYYY> — pick your seat and book: <absolute HTTPS URL>`. |
| Browser clipboard activation | `ClipboardItem({ 'text/plain': Promise<Blob> })` and `navigator.clipboard.write` invoked synchronously from Share click even though authenticated route/link lookup is asynchronous. Falls back to `navigator.clipboard.writeText`, then visible selected-text dialog. |
| Operator domain | Validated HTTPS public host; no credentials, fragment, existing query, localhost/IP/private link, script URL or HTTP. Invalid/missing configuration is rejected. |
| Privacy | Public share text includes only route cities, date and public operator search URL. No passenger details, PNR, phone, payment, OTP or GDS session URL. |
| Exact bus direct-link | The reference link is a **route/date search**, **not an exact-service deep link**: it does not contain a service or schedule identifier. The booking website determines which services appear and the current seat availability. The API explicitly returns `link_type: route_date_search` and `preselects_service:false`. A provider-supported deep link can be added only after its format is verified. |
| Preview card | Website preview appearance is determined by WhatsApp/open-graph metadata from the passenger site, **not** by copied clipboard text. |
| Backend state | Read-only share endpoint; no change to bookings, seats, fares, inventory or notifications. |

## Files

- `server/api/schedule-booking-share-v50.js`: authenticated route/date share endpoint; validation and message composition, optional Day-2+ origin offset.
- `server/api/configuration-v30.js`: persisted and validated `booking_search_url` under Website settings.
- `server/index.js`: mount new share endpoint.
- `public/js/configuration-v30.js`: operator Website booking-search URL field with explanation.
- `public/js/schedule-booking-share-v50.js`: clipboard-first copy helper plus plain text and manual fallback.
- `public/js/schedules-screenshot-v6.js`: replace previous internal-GDS-URL Share popup with actual customer booking message; toast or manual dialog.
- `public/index.html`: script ordering.
- `tests/schedule-booking-share-v50.test.cjs`: route/date and Day-2 generation, exact screenshot message, secure config, API/auth, clipboard activation and fallback, wiring.
- `.github/workflows/schedule-booking-share-v50.yml`: v50 + v49 PNG copy + v48 booking popup + full GDS regression.

## Production/UAT

Automated tests validate format, route and permission checks, and clipboard API behavior in a simulated browser environment. **Manual acceptance** requires loading a real operator schedule, configuring the correct operator URL and city-ID compatibility, pasting to WhatsApp Web/Desktop, opening the resulting webpage, and checking selected route/date and true site-provided inventory. The screenshot's past date (22 Nov 2026) is test/reference data; booking availability on that date is not asserted.

The official site exists, but public web retrieval did **not** confirm that the example route/date URL always opens a specific service or that WhatsApp's preview always displays; those checks depend on the site's actual booking deployment and metadata.
