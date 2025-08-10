
// Minimal live pilot for delivery: single Node app with Express + Socket.IO + in-memory store
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- In-memory "DB" (resets on restart) ---
let users = new Map();       // phone -> { phone, name, role }
let drivers = new Map();     // driverId -> {id, name, status, cashCapacity}
let bookings = new Map();    // id -> booking
let driverAssignments = new Map(); // bookingId -> driverId
let seq = 1;

// Seed one demo driver
const demoDriver = { id: 'DRV1', name: 'Demo Rider', status: 'online', cashCapacity: 10000 };
drivers.set(demoDriver.id, demoDriver);

// --- OTP (stubbed) ---
app.post('/api/otp/request', (req,res) => {
  const { phone } = req.body || {};
  if(!phone) return res.status(400).json({ error: 'phone required' });
  // In real life: send SMS. Here we accept code 123456 for any phone.
  res.json({ ok: true, code: '123456', message: 'Use 123456 for testing' });
});

app.post('/api/otp/verify', (req,res) => {
  const { phone, code, name, role } = req.body || {};
  if(!phone || !code) return res.status(400).json({ error: 'phone & code required' });
  if(code !== '123456') return res.status(401).json({ error: 'invalid code' });
  const user = { phone, name: name || ('User ' + phone.slice(-4)), role: role || 'customer' };
  users.set(phone, user);
  res.json({ token: 'demo-token-' + phone, user });
});

// --- Quote (simple) ---
function haversineKm(a, b) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
app.get('/api/quote', (req,res) => {
  const { pickup, drop, service='express' } = req.query;
  if(!pickup || !drop) return res.status(400).json({ error: 'pickup & drop required "lat,lng"' });
  const [plat, plng] = pickup.split(',').map(Number);
  const [dlat, dlng] = drop.split(',').map(Number);
  const km = haversineKm({lat:plat,lng:plng},{lat:dlat,lng:dlng});
  const base = service === 'tuktuk' ? 1.2 : service === 'standard' ? 1.0 : 1.4;
  const price = Math.max(3000, Math.round(base * (2000 + km * 1200))); // in KHR (rough)
  res.json({ km: +km.toFixed(2), currency: 'KHR', amount: price });
});

// --- Create booking ---
app.post('/api/bookings', (req,res) => {
  const { customerPhone, pickup, drop, service='express', cod=0, notes='' } = req.body || {};
  if(!customerPhone || !pickup || !drop) return res.status(400).json({ error: 'missing fields' });
  const id = 'BKG' + (seq++);
  const [plat, plng] = pickup.split(',').map(Number);
  const [dlat, dlng] = drop.split(',').map(Number);
  const createdAt = new Date().toISOString();
  const b = { id, customerPhone, pickup:{lat:plat,lng:plng}, drop:{lat:dlat,lng:dlng},
              service, cod, notes, status:'PENDING', createdAt };
  bookings.set(id, b);
  io.emit('booking_created', b);
  res.json(b);
});

// --- List bookings ---
app.get('/api/bookings', (req,res) => {
  res.json(Array.from(bookings.values()).sort((a,b)=>a.createdAt<b.createdAt?-1:1));
});

// --- Simple dispatch: assign first online driver ---
app.post('/api/dispatch/:id', (req,res) => {
  const id = req.params.id;
  const b = bookings.get(id);
  if(!b) return res.status(404).json({ error: 'not found' });
  if(driverAssignments.has(id)) return res.json({ ok:true, assignedTo: driverAssignments.get(id) });
  const online = Array.from(drivers.values()).find(d => d.status === 'online');
  if(!online) return res.status(409).json({ error: 'no drivers online' });
  driverAssignments.set(id, online.id);
  b.status = 'ASSIGNED';
  io.emit('booking_updated', b);
  res.json({ ok:true, assignedTo: online.id, booking: b });
});

// --- Driver: get tasks ---
app.get('/api/driver/:driverId/tasks', (req,res) => {
  const { driverId } = req.params;
  const tasks = Array.from(bookings.values()).filter(b => driverAssignments.get(b.id) === driverId && b.status !== 'DELIVERED');
  res.json(tasks);
});

// --- Driver: update status ---
app.post('/api/driver/:driverId/bookings/:id/status', (req,res) => {
  const { driverId, id } = req.params;
  const { status } = req.body || {};
  const b = bookings.get(id);
  if(!b) return res.status(404).json({ error: 'not found' });
  if(driverAssignments.get(id) !== driverId) return res.status(403).json({ error: 'not your task' });
  const allowed = ['EN_ROUTE_PICKUP','PICKED_UP','EN_ROUTE_DROP','DELIVERED'];
  if(!allowed.includes(status)) return res.status(400).json({ error: 'bad status' });
  b.status = status;
  io.emit('booking_updated', b);
  res.json(b);
});

// --- Health ---
app.get('/api/health', (req,res)=>res.json({ ok:true }));

// --- Static pages routes (served from /public) ---
app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.get('/customer', (req,res)=>res.sendFile(path.join(__dirname,'public','customer.html')));
app.get('/driver', (req,res)=>res.sendFile(path.join(__dirname,'public','driver.html')));
app.get('/admin', (req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log('Live pilot running on port', PORT));
