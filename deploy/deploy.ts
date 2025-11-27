import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedProofOfPrediction = await deploy("ProofOfPrediction", {
    from: deployer,
    log: true,
  });

  console.log(`ProofOfPrediction contract: `, deployedProofOfPrediction.address);
};
export default func;
func.id = "deploy_proofOfPrediction"; // id required to prevent reexecution
func.tags = ["ProofOfPrediction"];
