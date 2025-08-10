
# D2D Live Pilot (One-Service)

A minimal end-to-end live test for delivery flows: customer booking, admin dispatch, driver updates — all realtime via Socket.IO. Uses in-memory storage (resets on restart) to keep setup ultra-fast.

## Deploy on Render (Blueprint)
1) Create a new repo on GitHub and push this folder.
2) On Render, click "New +" → "Blueprint" → connect your repo.
3) It will read `render.yaml`, install and start automatically.

When deployed, open:
- `/customer` to create a booking (OTP code is **123456**, any phone).
- `/admin` to see bookings and click **Auto-Assign Driver**.
- `/driver` to progress statuses for the assigned task.

## Local run
```bash
npm install
npm start
# open http://localhost:10000/customer
```

## Next steps
- Swap in Postgres + Prisma for persistence
- Real OTP via SMS provider
- Map SDK & distance matrix pricing
- Split into proper services + mobile apps
