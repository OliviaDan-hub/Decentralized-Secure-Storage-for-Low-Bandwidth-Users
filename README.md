# LowDataVault: Decentralized Secure Storage for Low-Bandwidth Users

## Overview

**LowDataVault** is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It addresses the real-world challenge of secure, decentralized data storage and sharing in low-data environments—such as rural areas with intermittent internet, mobile devices in developing regions, or IoT sensors in remote deployments. Traditional cloud storage relies on constant high-bandwidth connections, which excludes billions of users globally (e.g., over 3 billion people lack reliable broadband, per ITU reports). LowDataVault enables users to store encrypted file shards across a decentralized network using **light clients**, which sync minimal blockchain proofs rather than full data, reducing data usage by up to 90%.

### Key Features
- **Light Client Integration**: Users interact via lightweight Stacks light clients (e.g., via Hiro's wallet SDK), submitting Merkle proofs for file integrity without downloading the entire chain. This supports environments with <100KB/month data caps.
- **Decentralized Storage**: Files are sharded, encrypted (AES-256), and distributed via IPFS pinning, with blockchain-anchored hashes for tamper-proof verification.
- **Access Control**: Granular permissions via NFTs representing access tokens, revocable on-chain.
- **Real-World Impact**: Empowers micro-entrepreneurs (e.g., farmers sharing crop data), humanitarian aid workers (secure offline document exchange), and remote educators (low-data content distribution). Solves issues like data silos in supply chains or privacy breaches in low-connectivity NGOs.

The protocol involves **6 solid Clarity smart contracts** for core functionality: user management, storage anchoring, access control, sharding logic, payment escrow, and governance. All contracts are audited-friendly, with formal verification hooks via Clarity's traits.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   Light Client  │───▶│  Stacks L1       │───▶│   IPFS Network   │
│ (Mobile/IoT)    │    │ (Clarity Contracts)│    │ (File Shards)    │
└─────────────────┘    └──────────────────┘    └──────────────────┘
         │                       │                       │
         └───────────Proofs──────┘                       └─────────Hashes
```

- **Frontend**: React Native app with Hiro Wallet integration for light client mode (syncs only block headers and proofs).
- **Backend**: Off-chain relayer for IPFS uploads (optional, for zero-bandwidth users).
- **Blockchain**: Stacks mainnet/testnet for immutability.
- **Data Flow**: User uploads shard → Contract anchors hash → Light client verifies via SPV proofs → Access via on-chain keys.

## Real-World Problems Solved
- **Bandwidth Poverty**: In regions like sub-Saharan Africa (37% internet penetration, World Bank), users can't afford data-heavy apps. LowDataVault uses <1KB per verification.
- **Data Privacy & Censorship**: Decentralized storage prevents single-point failures (e.g., govt shutdowns during protests).
- **Cost Barriers**: Micro-payments in STX for storage, subsidized via DAO for low-income users.
- **Scalability for Edge Devices**: IoT in agriculture (e.g., soil sensors) can anchor data without full node sync.

Pilot use case: Indian farmers storing land deeds and crop logs, verifiable by buyers with a simple QR scan on a feature phone.

## Smart Contracts (6 Core Contracts)

All contracts are written in Clarity v2, deployable via Clarinet. They use traits for composability and principal-based access control. Here's a high-level outline with key functions; full code in `/contracts/` directory.

### 1. `user-registry.clar` (User Onboarding & Identity)
   - **Purpose**: Registers users with minimal on-chain footprint (public key + light client pubkey).
   - **Key Functions**:
     - `register-user (principal, light-pubkey)`: Mints a user ID NFT.
     - `update-profile (user-id uint, new-data (buff 64))`: Updates encrypted profile hash.
     - **Maps/Traits**: User map `(map uint {pubkey: principal, lightkey: (buff 32), active: bool})`.
   - **Gas**: ~50k cycles/register.
   - **Security**: Only caller can update; uses `is-standard` for NFT standard.

### 2. `storage-anchor.clar` (File Hash Anchoring)
   - **Purpose**: Anchors IPFS CIDs and Merkle roots on-chain for light client verification.
   - **Key Functions**:
     - `anchor-file (user-id uint, file-hash (buff 32), shard-count uint)`: Emits event for relayer.
     - `verify-proof (merkle-proof (list buff), root-hash (buff))`: Validates light client proofs.
     - **Maps/Traits**: Anchor map `(map uint {hash: (buff 32), timestamp: uint, shards: uint})`.
   - **Gas**: ~80k cycles/anchor.
   - **Security**: Timestamped to prevent replays; integrates with SIP-010 for anchor NFTs.

### 3. `access-control.clar` (Permission Management)
   - **Purpose**: Manages NFT-based access tokens for files (e.g., view/edit/revoke).
   - **Key Functions**:
     - `grant-access (file-id uint, to-principal principal, perm-type uint)`: Mints access NFT.
     - `revoke-access (token-id uint)`: Burns NFT.
     - `check-access (file-id uint, caller principal)`: Returns bool for light clients.
   - **Maps/Traits**: Access map `(map uint (list principal))`; SIP-009 NFT trait.
   - **Gas**: ~60k cycles/grant.
   - **Security**: Ephemeral keys; revocable via owner principal.

### 4. `shard-manager.clar` (Sharding & Encryption Logic)
   - **Purpose**: On-chain logic for shard distribution (off-chain execution via relayer).
   - **Key Functions**:
     - `generate-shard-spec (file-size uint, redundancy uint)`: Computes shard count/threshold.
     - `reconstruct-threshold (shards (list buff), threshold uint)`: Verifies reconstruction feasibility.
     - **Maps/Traits**: Shard spec `(tuple (size uint) (threshold uint))`.
   - **Gas**: ~40k cycles/spec.
   - **Security**: Uses Clarity's `sha256` for shard hashing; prevents under-sharding attacks.

### 5. `escrow-payment.clar` (Micro-Payments for Storage)
   - **Purpose**: Escrows STX for storage providers, released on proof-of-storage.
   - **Key Functions**:
     - `deposit-escrow (file-id uint, amount uint)`: Locks STX.
     - `release-on-proof (proof (buff), file-id uint)`: Transfers to provider.
     - `refund (file-id uint)`: Returns unused funds.
   - **Maps/Traits**: Escrow map `(map uint {amount: uint, locked-by: principal})`.
   - **Gas**: ~70k cycles/deposit.
   - **Security**: Time-locked releases; integrates with sBTC for cross-chain if needed.

### 6. `governance-dao.clar` (Community Governance)
   - **Purpose**: DAO for protocol upgrades, subsidies, and dispute resolution.
   - **Key Functions**:
     - `propose-upgrade (proposal (string-ascii 128), yes-votes uint)`: Starts vote.
     - `vote (proposal-id uint, support bool)`: Weighted by staked STX.
     - `execute-proposal (id uint)`: If quorum met, updates traits.
   - **Maps/Traits**: Proposal map `(map uint {desc: (string-ascii 128), votes: uint, executed: bool})`.
   - **Gas**: ~100k cycles/propose.
   - **Security**: Quadratic voting to prevent whale dominance; 7-day timelock.

### Deployment & Testing
- **Tools**: Clarinet for local testing; deploy to testnet via Hiro CLI.
- **Integration**: Contracts use traits like `FTTrait` for payments and `NFTTrait` for access.
- **Audits**: Recommended via Certik; includes fuzzing for edge cases (e.g., invalid proofs).

## Setup Instructions

1. **Clone Repo**:
   ```
   git clone 
`git clone <repo-url>`
   cd lowdatavault
   ```

2. **Install Dependencies**:
   - Node.js 18+, Yarn.
   - `yarn install` for frontend.
   - Clarinet: `cargo install clarinet`.

3. **Run Locally**:
   ```
   clarinet integrate
   yarn dev  # Starts React Native app
   ```

4. **Deploy Contracts**:
   ```
   clarinet deploy --network testnet
   ```
   Update `Clarity.toml` with your API keys.

5. **Light Client Demo**:
   - Use Hiro Wallet in light mode.
   - Test: Register → Anchor dummy file → Grant access → Verify via proof.

## Contributing
- Fork, PR with tests.
- Issues: Track low-data optimizations.

## License
MIT. See `/LICENSE`.