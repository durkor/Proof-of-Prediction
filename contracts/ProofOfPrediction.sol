// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ProofOfPrediction
/// @notice Prediction market that stores selections and aggregated option counts as encrypted values.
contract ProofOfPrediction is ZamaEthereumConfig {
    enum PredictionStatus {
        Active,
        Closed
    }

    struct Prediction {
        string name;
        string[] options;
        PredictionStatus status;
        uint256 totalStake;
        uint256 totalParticipants;
        bool hasResult;
        uint256 resultIndex;
        address creator;
        euint32[] encryptedOptionCounts;
    }

    struct PredictionMetadata {
        string name;
        string[] options;
        PredictionStatus status;
        uint256 totalStake;
        uint256 totalParticipants;
        bool hasResult;
        uint256 resultIndex;
        address creator;
    }

    struct BetInfo {
        euint32 encryptedChoice;
        uint256 amount;
        bool exists;
    }

    Prediction[] private _predictions;
    mapping(uint256 => mapping(address => BetInfo)) private _bets;

    uint8 private constant MIN_OPTIONS = 2;
    uint8 private constant MAX_OPTIONS = 4;

    event PredictionCreated(uint256 indexed id, address indexed creator, string name);
    event BetPlaced(uint256 indexed predictionId, address indexed bettor, uint256 amount);
    event PredictionClosed(uint256 indexed predictionId, uint256 indexed winningOption, address indexed sender);
    event OptionCountAccessGranted(uint256 indexed predictionId, address indexed account);
    event BetAccessGranted(uint256 indexed predictionId, address indexed account);

    /// @notice Create a new prediction with 2-4 options.
    function createPrediction(string calldata name, string[] calldata options) external returns (uint256) {
        require(bytes(name).length > 0, "Name required");
        require(options.length >= MIN_OPTIONS && options.length <= MAX_OPTIONS, "Invalid option count");

        uint256 predictionId = _predictions.length;
        _predictions.push();
        Prediction storage prediction = _predictions[predictionId];
        prediction.name = name;
        prediction.status = PredictionStatus.Active;
        prediction.totalStake = 0;
        prediction.totalParticipants = 0;
        prediction.hasResult = false;
        prediction.resultIndex = type(uint256).max;
        prediction.creator = msg.sender;

        for (uint256 i = 0; i < options.length; i++) {
            require(bytes(options[i]).length > 0, "Empty option");
            prediction.options.push(options[i]);
        }

        euint32[] memory zeroCounts = new euint32[](options.length);
        for (uint256 i = 0; i < options.length; i++) {
            zeroCounts[i] = FHE.asEuint32(0);
        }
        prediction.encryptedOptionCounts = zeroCounts;

        for (uint256 i = 0; i < prediction.encryptedOptionCounts.length; i++) {
            FHE.allowThis(prediction.encryptedOptionCounts[i]);
        }

        emit PredictionCreated(predictionId, msg.sender, name);
        return predictionId;
    }

    /// @notice Place an encrypted bet on a prediction.
    function placeEncryptedBet(uint256 predictionId, externalEuint32 encryptedChoice, bytes calldata inputProof)
        external
        payable
    {
        Prediction storage prediction = _prediction(predictionId);
        require(prediction.status == PredictionStatus.Active, "Prediction closed");
        require(msg.value > 0, "Stake required");

        BetInfo storage bet = _bets[predictionId][msg.sender];
        require(!bet.exists, "Bet already placed");

        euint32 choice = FHE.fromExternal(encryptedChoice, inputProof);

        bet.amount = msg.value;
        bet.encryptedChoice = choice;
        bet.exists = true;

        prediction.totalStake += msg.value;
        prediction.totalParticipants += 1;

        _incrementCounts(predictionId, choice);

        FHE.allowThis(choice);
        FHE.allow(choice, msg.sender);

        emit BetPlaced(predictionId, msg.sender, msg.value);
    }

    /// @notice Allow a caller to decrypt the encrypted counts for a prediction.
    function requestOptionCountAccess(uint256 predictionId) external {
        Prediction storage prediction = _prediction(predictionId);
        for (uint256 i = 0; i < prediction.encryptedOptionCounts.length; i++) {
            FHE.allow(prediction.encryptedOptionCounts[i], msg.sender);
        }
        emit OptionCountAccessGranted(predictionId, msg.sender);
    }

    /// @notice Allow a caller to decrypt their bet selection for a prediction.
    function requestBetAccess(uint256 predictionId) external {
        BetInfo storage bet = _bets[predictionId][msg.sender];
        require(bet.exists, "No bet found");
        FHE.allow(bet.encryptedChoice, msg.sender);
        emit BetAccessGranted(predictionId, msg.sender);
    }

    /// @notice Close a prediction and store the winning option index.
    function closePrediction(uint256 predictionId, uint256 winningOption) external {
        Prediction storage prediction = _prediction(predictionId);
        require(prediction.status == PredictionStatus.Active, "Already closed");
        require(winningOption < prediction.options.length, "Invalid option");

        prediction.status = PredictionStatus.Closed;
        prediction.hasResult = true;
        prediction.resultIndex = winningOption;

        emit PredictionClosed(predictionId, winningOption, msg.sender);
    }

    /// @notice Get the total number of predictions.
    function getPredictionCount() external view returns (uint256) {
        return _predictions.length;
    }

    /// @notice Fetch metadata for a single prediction.
    function getPrediction(uint256 predictionId) external view returns (PredictionMetadata memory) {
        Prediction storage prediction = _prediction(predictionId);
        return _buildMetadata(prediction);
    }

    /// @notice Fetch metadata for all predictions.
    function getAllPredictions() external view returns (PredictionMetadata[] memory) {
        PredictionMetadata[] memory result = new PredictionMetadata[](_predictions.length);
        for (uint256 i = 0; i < _predictions.length; i++) {
            result[i] = _buildMetadata(_predictions[i]);
        }
        return result;
    }

    /// @notice Get encrypted option counts for a prediction.
    function getEncryptedOptionCounts(uint256 predictionId) external view returns (euint32[] memory) {
        Prediction storage prediction = _prediction(predictionId);
        euint32[] memory counts = new euint32[](prediction.encryptedOptionCounts.length);
        for (uint256 i = 0; i < counts.length; i++) {
            counts[i] = prediction.encryptedOptionCounts[i];
        }
        return counts;
    }

    /// @notice Get bet info for a given user on a prediction.
    function getBet(uint256 predictionId, address account) external view returns (BetInfo memory) {
        return _bets[predictionId][account];
    }

    function _prediction(uint256 predictionId) internal view returns (Prediction storage prediction) {
        require(predictionId < _predictions.length, "Invalid prediction");
        prediction = _predictions[predictionId];
    }

    function _buildMetadata(Prediction storage prediction) internal view returns (PredictionMetadata memory) {
        string[] memory opts = new string[](prediction.options.length);
        for (uint256 i = 0; i < prediction.options.length; i++) {
            opts[i] = prediction.options[i];
        }
        return PredictionMetadata({
            name: prediction.name,
            options: opts,
            status: prediction.status,
            totalStake: prediction.totalStake,
            totalParticipants: prediction.totalParticipants,
            hasResult: prediction.hasResult,
            resultIndex: prediction.resultIndex,
            creator: prediction.creator
        });
    }

    function _incrementCounts(uint256 predictionId, euint32 encryptedChoice) internal {
        Prediction storage prediction = _predictions[predictionId];
        euint32 one = FHE.asEuint32(1);
        euint32 zero = FHE.asEuint32(0);
        for (uint256 i = 0; i < prediction.encryptedOptionCounts.length; i++) {
            ebool isMatch = FHE.eq(encryptedChoice, FHE.asEuint32(uint32(i)));
            euint32 delta = FHE.select(isMatch, one, zero);
            euint32 updated = FHE.add(prediction.encryptedOptionCounts[i], delta);
            prediction.encryptedOptionCounts[i] = updated;
            FHE.allowThis(updated);
        }
    }
}
