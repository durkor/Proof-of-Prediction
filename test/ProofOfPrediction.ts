import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { ProofOfPrediction, ProofOfPrediction__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("ProofOfPrediction")) as ProofOfPrediction__factory;
  const contract = (await factory.deploy()) as ProofOfPrediction;
  const contractAddress = await contract.getAddress();
  return { contract, contractAddress };
}

describe("ProofOfPrediction", () => {
  let signers: Signers;
  let proofContract: ProofOfPrediction;
  let proofContractAddress: string;

  before(async function () {
    const ethSigners = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This test suite must run inside the mock FHEVM");
      this.skip();
    }

    ({ contract: proofContract, contractAddress: proofContractAddress } = await deployFixture());
  });

  it("creates predictions and stores metadata", async () => {
    await proofContract.createPrediction("Weather", ["Sunny", "Rainy", "Snow"]);

    const count = await proofContract.getPredictionCount();
    expect(count).to.eq(1);

    const prediction = await proofContract.getPrediction(0);
    expect(prediction.name).to.eq("Weather");
    expect(prediction.options).to.deep.eq(["Sunny", "Rainy", "Snow"]);
    expect(prediction.status).to.eq(0); // Active
    expect(prediction.totalStake).to.eq(0);
    expect(prediction.totalParticipants).to.eq(0);
    expect(prediction.hasResult).to.be.false;
  });

  it("accepts encrypted bets and increments encrypted option counts", async () => {
    await proofContract.createPrediction("Winner", ["Team A", "Team B"]);

    const encryptedChoice = await fhevm
      .createEncryptedInput(proofContractAddress, signers.alice.address)
      .add32(1)
      .encrypt();

    const stake = ethers.parseEther("0.25");
    await proofContract
      .connect(signers.alice)
      .placeEncryptedBet(0, encryptedChoice.handles[0], encryptedChoice.inputProof, { value: stake });

    const bet = await proofContract.getBet(0, signers.alice.address);
    expect(bet.amount).to.eq(stake);
    expect(bet.exists).to.be.true;

    await proofContract.connect(signers.alice).requestOptionCountAccess(0);
    const encryptedCounts = await proofContract.getEncryptedOptionCounts(0);

    const decryptedCounts = [];
    for (let i = 0; i < encryptedCounts.length; i++) {
      const clearValue = await fhevm.userDecryptEuint(
        FhevmType.euint32,
        encryptedCounts[i],
        proofContractAddress,
        signers.alice,
      );
      decryptedCounts.push(clearValue);
    }

    expect(decryptedCounts[0]).to.eq(0);
    expect(decryptedCounts[1]).to.eq(1);

    await proofContract.connect(signers.alice).requestBetAccess(0);
    const decryptedChoice = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      bet.encryptedChoice,
      proofContractAddress,
      signers.alice,
    );
    expect(decryptedChoice).to.eq(1);
  });

  it("allows anyone to close predictions with a winning option", async () => {
    await proofContract.createPrediction("MVP", ["Alice", "Bob"]);
    await proofContract.connect(signers.bob).closePrediction(0, 1);

    const prediction = await proofContract.getPrediction(0);
    expect(prediction.status).to.eq(1); // Closed
    expect(prediction.hasResult).to.be.true;
    expect(prediction.resultIndex).to.eq(1);
  });
});
