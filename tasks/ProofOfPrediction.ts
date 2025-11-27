import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("prediction:address", "Prints the ProofOfPrediction contract address").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;
    const deployment = await deployments.get("ProofOfPrediction");
    console.log(`ProofOfPrediction: ${deployment.address}`);
  },
);

task("prediction:create", "Creates a new prediction")
  .addParam("name", "The prediction title")
  .addParam("options", "Comma separated list with 2-4 options, e.g. 'Yes,No'")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const deployment = await deployments.get("ProofOfPrediction");
    const contract = await ethers.getContractAt("ProofOfPrediction", deployment.address);
    const signers = await ethers.getSigners();

    const rawOptions = (taskArguments.options as string).split(",").map((option) => option.trim()).filter(Boolean);
    if (rawOptions.length < 2 || rawOptions.length > 4) {
      throw new Error("Please provide between 2 and 4 options");
    }

    const tx = await contract.connect(signers[0]).createPrediction(taskArguments.name as string, rawOptions);
    console.log(`createPrediction tx: ${tx.hash}`);
    await tx.wait();
    console.log("Prediction created!");
  });

task("prediction:bet", "Places an encrypted bet")
  .addParam("predictionId", "ID of the prediction")
  .addParam("option", "Plain option index that will be encrypted before submission")
  .addParam("amount", "Amount of ETH to stake, e.g. 0.05")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const predictionId = parseInt(taskArguments.predictionId as string, 10);
    const option = parseInt(taskArguments.option as string, 10);
    const amount = ethers.parseEther(taskArguments.amount as string);

    if (!Number.isInteger(predictionId) || predictionId < 0) {
      throw new Error("Invalid prediction id");
    }
    if (!Number.isInteger(option) || option < 0) {
      throw new Error("Invalid option index");
    }

    const deployment = await deployments.get("ProofOfPrediction");
    const contract = await ethers.getContractAt("ProofOfPrediction", deployment.address);
    const signers = await ethers.getSigners();

    const encryptedInput = await fhevm
      .createEncryptedInput(deployment.address, signers[0].address)
      .add32(option)
      .encrypt();

    const tx = await contract
      .connect(signers[0])
      .placeEncryptedBet(encryptedInput.handles[0], encryptedInput.inputProof, { value: amount });
    console.log(`placeEncryptedBet tx: ${tx.hash}`);
    await tx.wait();
    console.log("Bet submitted!");
  });

task("prediction:decrypt-counts", "Decrypts encrypted option counts for a prediction")
  .addParam("predictionId", "ID of the prediction")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const predictionId = parseInt(taskArguments.predictionId as string, 10);
    if (!Number.isInteger(predictionId) || predictionId < 0) {
      throw new Error("Invalid prediction id");
    }

    const deployment = await deployments.get("ProofOfPrediction");
    const contract = await ethers.getContractAt("ProofOfPrediction", deployment.address);
    const signers = await ethers.getSigners();

    const tx = await contract.connect(signers[0]).requestOptionCountAccess(predictionId);
    await tx.wait();

    const encryptedCounts = await contract.getEncryptedOptionCounts(predictionId);
    const metadata = await contract.getPrediction(predictionId);

    console.log(`Prediction: ${metadata.name} (${metadata.options.length} options)`);
    for (let i = 0; i < encryptedCounts.length; i++) {
      const clearValue = await fhevm.userDecryptEuint(
        FhevmType.euint32,
        encryptedCounts[i],
        deployment.address,
        signers[0],
      );
      console.log(`Option ${i} (${metadata.options[i]}): ${clearValue.toString()}`);
    }
  });
