# Proof of Prediction

Proof of Prediction is a privacy-preserving prediction market where every choice and aggregated vote count stays encrypted on-chain. Participants publish a prediction with 2-4 outcomes, stake ETH on an encrypted selection, and can later decrypt either their own pick or the encrypted tallies via access control lists. The protocol is powered by Zama's FHEVM so the chain never sees a user's choice while still keeping on-chain state verifiable.

## Why it matters
- Private picks with public accountability: selections and option counts are stored as encrypted `euint32` values while all metadata and stakes remain on-chain.
- Fairness without trust: anyone can create a market or close it by submitting the correct outcome; no centralized operator or off-chain database is needed.
- On-chain audit trail: ETH stakes, participants, and results are immutable while the sensitive votes are only decryptable by whitelisted users.
- Built for real usage: no mocks in the frontend, no localhost network, and ABI is sourced from the generated contract artifacts to stay in sync.

## Key features and advantages
- Encrypted betting: users encrypt their option index client-side with the Zama relayer SDK and submit it with an ETH stake.
- Encrypted aggregation: option counts are summed on-chain using FHE operations, preventing inference attacks while keeping totals queryable.
- User-controlled reveal: users can request ACLs to decrypt their own selection or the encrypted counts when needed.
- Permissionless lifecycle: anyone can publish a prediction (2-4 options) and anyone can close it with the winning option index; settlement is intentionally deferred for now.
- Dual-stack client: reads rely on `viem` for performance, writes use `ethers` to match the contract ABI; RainbowKit handles wallet connections.
- Tested workflows: unit tests cover the mock FHEVM path; a Sepolia test demonstrates live encryption/decryption flows.

## Tech stack
- Smart contracts: Solidity 0.8.27, `@fhevm/solidity` 0.9.1, Hardhat + hardhat-deploy, TypeChain (ethers v6).
- Encryption rails: Zama FHEVM plugin and `@zama-fhe/relayer-sdk` for encryption, user decryption, and ACL management.
- Frontend: React 19 + Vite 7, `viem` (reads), `ethers` (writes), RainbowKit/Wagmi (Sepolia), CSS (no Tailwind).
- Tooling: TypeScript across stack, ESLint, Prettier, solidity-coverage, hardhat-gas-reporter.

## Core flows
1. Create prediction  
   - Call `createPrediction(name, options[])` with 2-4 options. Initializes encrypted counts to zero and grants the contract ACL over them.
2. Place encrypted bet  
   - Client encrypts an option index with the relayer SDK, submits `placeEncryptedBet(predictionId, encryptedChoice, proof)` with an ETH stake. Contract increments encrypted counts using FHE `select`/`add`.
3. Decrypt counts  
   - Call `requestOptionCountAccess(predictionId)` to grant ACL, then use the relayer SDK's `userDecrypt` on the returned ciphertext handles from `getEncryptedOptionCounts`.
4. Decrypt personal selection  
   - Call `requestBetAccess(predictionId)` then `getBet` and `userDecrypt` to recover the caller's encrypted choice.
5. Close prediction  
   - Anyone calls `closePrediction(predictionId, winningOption)` to freeze the market and record the winning index (no payout logic yet).

## Repository layout
```
contracts/          ProofOfPrediction.sol (encrypted prediction logic)
deploy/             Hardhat deploy script (sepolia-ready, private key only)
deployments/        Generated addresses & ABI (e.g., deployments/sepolia/ProofOfPrediction.json)
tasks/              Hardhat tasks for create/bet/decrypt flows
test/               Unit tests (mock FHEVM) and Sepolia integration test
docs/               Zama FHE/relayer reference notes
ui/                 React + Vite frontend (reads with viem, writes with ethers)
```

## Prerequisites
- Node.js 20+
- npm
- A Sepolia account funded with ETH
- Environment in the repo root: `PRIVATE_KEY` (deployer, no mnemonic) and `INFURA_API_KEY` for RPC; optional `ETHERSCAN_API_KEY` for verification. The Hardhat config already imports `dotenv` and reads `process.env.PRIVATE_KEY`/`process.env.INFURA_API_KEY`.

## Setup
```bash
# Root (contracts & tasks)
npm install

# Frontend (UI)
cd ui
npm install
```

## Configuration notes
- Contract ABI and address: always use the generated artifact in `deployments/sepolia/ProofOfPrediction.json`. Copy the ABI and address into `ui/src/config/contracts.ts` after every deploy so the UI stays in sync.
- Frontend constants: the UI does not use environment variables; configure network/project IDs directly in `ui/src/config` (e.g., WalletConnect `projectId` in `wagmi.ts`).
- Network: the dApp targets Sepolia; the UI avoids localhost and local storage.

## Useful scripts (root)
- `npm run compile` - compile Solidity and regenerate TypeChain types.
- `npm test` - run mock FHEVM unit tests.
- `npm run test:sepolia` - run the Sepolia integration test (requires funded deployer and live contract).
- `npm run deploy:sepolia` - deploy with `PRIVATE_KEY` + `INFURA_API_KEY`.
- `npm run verify:sepolia <address>` - verify on Etherscan (set `ETHERSCAN_API_KEY` in Hardhat vars or env).

### Hardhat tasks
- `npx hardhat prediction:address` - print deployed address (from `deployments`).
- `npx hardhat prediction:create --name "Title" --options "Yes,No"` - publish a market (2-4 comma-separated options).
- `npx hardhat prediction:bet --prediction-id 0 --option 1 --amount 0.05` - encrypt option index client-side and stake ETH.
- `npx hardhat prediction:decrypt-counts --prediction-id 0` - request ACL and decrypt encrypted option counts with the relayer SDK.

## Frontend workflow
1. Update `ui/src/config/contracts.ts` with the latest address/ABI from `deployments/sepolia/ProofOfPrediction.json`.
2. Set your WalletConnect `projectId` in `ui/src/config/wagmi.ts`.
3. From `ui`, run `npm run dev` for local preview or `npm run build && npm run preview` for a production bundle (still targeting Sepolia).
4. Connect a wallet with Sepolia ETH, create predictions, place encrypted bets, decrypt counts or your selection from the UI. Closing a prediction is currently done via the Hardhat task.

## Deployment to Sepolia
1. Ensure `PRIVATE_KEY` (no mnemonic) and `INFURA_API_KEY` are set.
2. Run `npm run compile` then `npm run deploy:sepolia`.
3. The deploy script logs the contract address and writes `deployments/sepolia/ProofOfPrediction.json`; copy its ABI/address into the frontend config.
4. (Optional) Verify with `npm run verify:sepolia <address>`.

## Testing
- Mock path: `npm test` uses the mock FHEVM provided by the Hardhat plugin to validate creation, encrypted betting, ACL granting, and closing.
- Sepolia path: `npm run test:sepolia` exercises live encryption/decryption via the relayer SDK against the deployed contract (requires funding and network access).

## Problems addressed
- **Privacy leakage in prediction markets:** encrypted picks prevent peers from inferring sentiment until access is explicitly granted.
- **Tamper-resistant aggregation:** encrypted counts are updated on-chain with FHE arithmetic, eliminating off-chain tallying or trusted servers.
- **Transparent yet private UX:** ETH flows and metadata remain public for auditability, while sensitive selections are only decryptable by authorized parties.
- **Operator minimization:** creation and closure are permissionless; no admin keys are needed for core lifecycle actions.

## Future roadmap
- Add settlement and reward distribution once winners are posted (handling encrypted balances safely).
- Rich analytics once counts are decrypted (time-series exposure, participation heatmaps).
- Multi-network readiness as additional FHEVM host chains mature.
- Enhanced frontend polish: optimistic UI around encryption, clearer ACL status, and mobile-first layout refinements.
- Additional access controls (e.g., scoped decryption windows, role-gated prediction creation) if required by governance.

## Documentation references
- `docs/zama_llm.md` - detailed FHEVM Solidity patterns and ACL guidance.
- `docs/zama_doc_relayer.md` - relayer SDK usage for encryption, user decryption, and public decrypt flows.
- Zama protocol docs: https://docs.zama.ai

## License
BSD-3-Clause-Clear. See `LICENSE` for details.
