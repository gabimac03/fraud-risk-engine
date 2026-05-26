<p align="center">
  <img src="./resources/Diagrama-Fraud-Risk.png" alt="Arquitectura del Motor de Riesgo" width="800">
</p>

### 1. Cryptographic Hardware Fingerprinting & Anti-Spoofing
* **True Device ID Generation:** Instead of relying on client-side, easily mutable `deviceId` strings, the system extracts core immutable hardware properties (`canvasFingerprint`, `hardwareConcurrency`, `deviceMemory`).
* **Deterministic Hashing:** Nodes aggregate this physical metadata into a SHA-256 hash at execution time.
* **Spoofing Detection:** If the client-provided identifier deviates from the cryptographic calculation, the transaction triggers an instant `Spoofing Detection` penalty (+30 Risk Score).

### 2. Microsecond Perimeter Guard (Layer 1 Defense)
* Leverages Redis native **Sets** (`SISMEMBER`) to instantly accept or discard transactions based on actor reputation in `< 1ms`.
* **Blacklist Check:** Instant rejection (`DENY`, Risk Score 100) if the `userId`, `cardNumberToken`, or the cryptographic `trueDeviceId` matches historical fraud records.
* **Whitelist Check:** Fast-tracks verified VIP accounts bypassing resource-heavy validation pipelines.

### 3. Atomic Sliding Window Rate Limiting (Layer 2 Defense)
* **The Mitigation:** Prevents bots and velocity/carding attacks crossing block intervals. 
* **Implementation:** Utilizes Redis **Sorted Sets** inside an atomic transaction pipeline (`multi`). 
* Every request removes old registers via `ZREMRANGEBYSCORE` using a shifting window ($now - 10000ms$), appends the current timestamp via `ZADD`, and counts active interactions via `ZCARD`.
* **Cross-Velocity Regulation:** Tracks hardware concurrency limits when multiple credit cards are stacked into a single `trueDeviceId` within a 10-minute window, triggering a forced step-up 2FA Challenge.

### 4. Event-Driven Asynchronous Decoupling (RabbitMQ)
* **Problem Solved:** Traditional blocking I/O storage drops request/response throughput when writing analytical logs to disk.
* **Solution:** Once the risk score is evaluated, the system flushes a structured event `transaction_evaluated` using an AMQP `ClientProxy` to **RabbitMQ** (taking $< 0.5ms$) and returns the HTTP payload immediately.
* **Background Workers:** A detached controller (`FraudLogConsumer`) consumes messages from the `fraud_audit_logs` queue out-of-band, processing database persistency to MongoDB without degrading system latency.

---

## 🛠️ Technology Stack

* **Framework:** NestJS (Configured as a Hybrid Application: HTTP Rest API + AMQP Microservice)
* **In-Memory Storage & Flow Control:** Redis (ioRedis via pipeline adapters)
* **Message Broker:** RabbitMQ (AMQP 0-9-1)
* **Database:** MongoDB (Mongoose Object Modeling)
* **Cryptography:** Native Node.js `crypto` (SHA-256 Engine)

---

## 🚀 Local Deployment & Verification

### 1. Infrastructure (Docker)
Ensure Docker is installed and initialize the specialized infrastructure cluster:

```bash
# Spin up Redis, MongoDB and RabbitMQ Management instances
docker run -d --name redis-fraud -p 6379:6379 redis:alpine
docker run -d --name mongo-fraud -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=root -e MONGO_INITDB_ROOT_PASSWORD=fraud_pass123 mongo:latest
docker run -d --name rabbit-fraud -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

## 2. Installation
```bash
npm install
```

## 3. Run the Application
```bash 
npm run start:dev
```
You will see the confirmation log: 📭 Escuchando cola 'fraud_audit_logs' en RabbitMQ...

# 📈 Enterprise Production-Scale Roadmap (Future Enhancements)

When scaling this framework to process 50,000+ RPS, the system is architecturally prepared to embed the following additions:

1. Circuit Breaker Pattern (Fault-Tolerance Fallbacks)
Concept: Integrate an execution circuit (e.g., opossum) monitoring Redis connection stability.

Action: If Redis hits a 15% packet error rate due to heavy network congestion, the circuit opens ("trips the breaker") diverting traffic to a localized cache or fallback mechanism. Transactions degrade gracefully into a standard CHALLENGE routine rather than locking up the client thread with gateway timeouts.

2. AMQP Dead Letter Queues (DLQ) & Dead-Letter Exchanges (DLX)
Concept: Insulate analytics from network paraded data losses.

Action: If the background Worker crashes or database transaction locks prevent writing records to MongoDB, RabbitMQ re-routes the message to an audit fallback queue (fraud_audit_logs_dlq) after 3 attempts (Retry Pattern), throwing operational metrics to monitor platforms before purging memory.

3. Hot-Swappable Dynamic Rules Engine
Concept: Abstract configuration variables out of hardcoded software domains.

Action: Migrating sliding window limit scores (e.g., 5 transactions maximum) and restriction thresholds into dedicated Redis Hash configurations. Allows non-technical Risk Teams to tune transactional firewalls live on production systems globally in 0ms without running full software re-deployments or server warmups.