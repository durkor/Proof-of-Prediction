import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm, deployments } from "hardhat";
import { ProofOfPrediction } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("ProofOfPredictionSepolia", function () {
  let signers: Signers;
  let proofContract: ProofOfPrediction;
  let proofContractAddress: string;
  let step = 0;
  let steps = 0;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn("This test only runs on Sepolia");
      this.skip();
    }

    const deployment = await deployments.get("ProofOfPrediction");
    proofContractAddress = deployment.address;
    proofContract = await ethers.getContractAt("ProofOfPrediction", deployment.address);

    const ethSigners = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  beforeEach(() => {
    step = 0;
    steps = 0;
  });

  it("creates a prediction, places a bet, and decrypts counts", async function () {
    this.timeout(4 * 40000);
    steps = 9;

    progress("Creating prediction...");
    const createTx = await proofContract.connect(signers.alice).createPrediction("Sepolia Demo", ["Yes", "No"]);
    await createTx.wait();

    const totalPredictions = await proofContract.getPredictionCount();
    const predictionId = Number(totalPredictions) - 1;

    progress("Encrypting option index 0...");
    const encryptedChoice = await fhevm
      .createEncryptedInput(proofContractAddress, signers.alice.address)
      .add32(0)
      .encrypt();

    progress("Placing encrypted bet...");
    const betTx = await proofContract
      .connect(signers.alice)
      .placeEncryptedBet(predictionId, encryptedChoice.handles[0], encryptedChoice.inputProof, {
        value: ethers.parseEther("0.0001"),
      });
    await betTx.wait();

    progress("Requesting access to encrypted counts...");
    const grantTx = await proofContract.connect(signers.alice).requestOptionCountAccess(predictionId);
    await grantTx.wait();

    progress("Reading encrypted counts...");
    const encryptedCounts = await proofContract.getEncryptedOptionCounts(predictionId);

    progress("Decrypting option 0 count...");
    const option0Count = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedCounts[0],
      proofContractAddress,
      signers.alice,
    );

    progress("Decrypting option 1 count...");
    const option1Count = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedCounts[1],
      proofContractAddress,
      signers.alice,
    );

    progress(`Option 0 clear count: ${option0Count.toString()}`);
    progress(`Option 1 clear count: ${option1Count.toString()}`);

    expect(option0Count + option1Count).to.eq(1n);
  });
});
