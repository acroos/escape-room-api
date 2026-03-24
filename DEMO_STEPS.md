# Demo Steps

Walk through the full reservation flow against the deployed API.

**Base URL**: `https://escape-room-api-acroos.vercel.app`

## 1. Find a room

```bash
curl https://escape-room-api-acroos.vercel.app/api/rooms
```

Pick a room ID from the response. We'll use it in all subsequent steps.

```bash
export ROOM_ID="<paste a room id here>"
```

## 2. Pick a future timeslot

Timeslots are milliseconds from epoch and must be on the hour. Generate one for tomorrow at noon:

```bash
# macOS
export TIMESLOT=$(date -v+1d -v12H -v0M -v0S -j +%s)000

# Linux
export TIMESLOT=$(date -d "tomorrow 12:00:00" +%s)000
```

## 3. Place a hold

```bash
curl -s -X POST https://escape-room-api-acroos.vercel.app/api/reservations/hold \
  -H "Content-Type: application/json" \
  -d "{\"room_id\": \"$ROOM_ID\", \"timeslot\": $TIMESLOT}"
```

Save the reservation code:

```bash
export CODE="<paste reservation_code from response>"
```

**Expected**: `201` with `{ "reservation_code": "..." }`

## 4. Check the hold

```bash
curl -s https://escape-room-api-acroos.vercel.app/api/reservations/$ROOM_ID/$TIMESLOT \
  -H "x-reservation-code: $CODE"
```

**Expected**: `200` with `{ "ttl": <seconds remaining> }`

## 5. Release the hold

```bash
curl -s -X POST https://escape-room-api-acroos.vercel.app/api/reservations/release \
  -H "Content-Type: application/json" \
  -H "x-reservation-code: $CODE" \
  -d "{\"room_id\": \"$ROOM_ID\", \"timeslot\": $TIMESLOT}"
```

**Expected**: `200` with `{ "success": true }`

## 6. Hold it again

```bash
curl -s -X POST https://escape-room-api-acroos.vercel.app/api/reservations/hold \
  -H "Content-Type: application/json" \
  -d "{\"room_id\": \"$ROOM_ID\", \"timeslot\": $TIMESLOT}"
```

Save the new reservation code:

```bash
export CODE="<paste new reservation_code>"
```

**Expected**: `201` with a new reservation code

## 7. Confirm the reservation

```bash
curl -s -X POST https://escape-room-api-acroos.vercel.app/api/reservations/confirm \
  -H "Content-Type: application/json" \
  -H "x-reservation-code: $CODE" \
  -d "{\"room_id\": \"$ROOM_ID\", \"timeslot\": $TIMESLOT, \"email\": \"demo@example.com\", \"full_name\": \"Demo User\"}"
```

**Expected**: `201` with `{ "reservation_id": "..." }`

---

## Validation: when holds should fail

### Hold an already-confirmed slot

```bash
curl -s -X POST https://escape-room-api-acroos.vercel.app/api/reservations/hold \
  -H "Content-Type: application/json" \
  -d "{\"room_id\": \"$ROOM_ID\", \"timeslot\": $TIMESLOT}"
```

**Expected**: `409` with `{ "error": "already_confirmed" }`

### Hold a timeslot in the past

```bash
curl -s -X POST https://escape-room-api-acroos.vercel.app/api/reservations/hold \
  -H "Content-Type: application/json" \
  -d "{\"room_id\": \"$ROOM_ID\", \"timeslot\": 1704067200000}"
```

**Expected**: `400` with `{ "error": "timeslot_in_past" }`

### Hold with an invalid timeslot (not on the hour)

```bash
curl -s -X POST https://escape-room-api-acroos.vercel.app/api/reservations/hold \
  -H "Content-Type: application/json" \
  -d "{\"room_id\": \"$ROOM_ID\", \"timeslot\": 1780335000000}"
```

**Expected**: `400` with `{ "error": "invalid_timeslot" }`

### Hold with a non-existent room

```bash
curl -s -X POST https://escape-room-api-acroos.vercel.app/api/reservations/hold \
  -H "Content-Type: application/json" \
  -d '{"room_id": "00000000-0000-0000-0000-000000000000", "timeslot": 1780333200000}'
```

**Expected**: `400` with `{ "error": "room_not_found" }`

### Check a hold with the wrong code

```bash
curl -s https://escape-room-api-acroos.vercel.app/api/reservations/$ROOM_ID/$TIMESLOT \
  -H "x-reservation-code: wrong-code"
```

**Expected**: `403` with `{ "error": "code_mismatch" }` (if a hold exists) or `404` (if no hold)
