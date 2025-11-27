import { useState } from 'react';
import { Contract } from 'ethers';
import { formatEther, parseEther, type PublicClient } from 'viem';

import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import type { PredictionMetadata } from './PredictionApp';
import '../styles/PredictionCard.css';

type Props = {
  prediction: PredictionMetadata;
  account?: string;
  signer: Promise<any> | undefined;
  instance: any;
  publicClient: PublicClient | undefined;
  onActionComplete: () => Promise<unknown> | unknown;
};

type BetResponse = {
  encryptedChoice: string;
  amount: bigint;
  exists: boolean;
};

type HexAddress = `0x${string}`;

export function PredictionCard({ prediction, account, signer, instance, publicClient, onActionComplete }: Props) {
  const isActive = prediction.status === 0;
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [stakeAmount, setStakeAmount] = useState('0.01');
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [isDecryptingCounts, setIsDecryptingCounts] = useState(false);
  const [isDecryptingSelection, setIsDecryptingSelection] = useState(false);
  const [decryptedCounts, setDecryptedCounts] = useState<number[] | null>(null);
  const [mySelection, setMySelection] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const winningOption = prediction.hasResult ? prediction.resultIndex : null;

  const formatAddress = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;

  const ensureSigner = async () => {
    if (!signer) {
      throw new Error('Connect your wallet first.');
    }
    const resolvedSigner = await signer;
    if (!resolvedSigner) {
      throw new Error('Signer unavailable');
    }
    return resolvedSigner;
  };

  const ensurePrerequisites = () => {
    if (!account) {
      throw new Error('Connect your wallet first.');
    }
    if (!instance) {
      throw new Error('Encryption service not ready yet.');
    }
    if (!publicClient) {
      throw new Error('Public client not available.');
    }
  };

  const executeUserDecrypt = async (handles: string[]) => {
    ensurePrerequisites();
    const resolvedSigner = await ensureSigner();

    const keypair = instance.generateKeypair();
    const handleContractPairs = handles.map((handle) => ({
      handle,
      contractAddress: CONTRACT_ADDRESS,
    }));
    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = '10';
    const contractAddresses = [CONTRACT_ADDRESS];
    const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);

    const signature = await resolvedSigner.signTypedData(
      eip712.domain,
      {
        UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
      },
      eip712.message,
    );

    return instance.userDecrypt(
      handleContractPairs,
      keypair.privateKey,
      keypair.publicKey,
      signature.replace('0x', ''),
      contractAddresses,
      account,
      startTimeStamp,
      durationDays,
    ) as Promise<Record<string, string>>;
  };

  const handlePlaceBet = async () => {
    setActionMessage(null);

    if (selectedOption === null) {
      setActionMessage('Select an option before placing your bet.');
      return;
    }

    try {
      ensurePrerequisites();
      const parsedAmount = parseFloat(stakeAmount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Stake must be greater than zero.');
      }

      setIsPlacingBet(true);

      const resolvedSigner = await ensureSigner();
      const encryptedInput = instance
        .createEncryptedInput(CONTRACT_ADDRESS, account)
        .add32(selectedOption)
        .encrypt();

      const ciphertext = await encryptedInput;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, resolvedSigner);
      const tx = await contract.placeEncryptedBet(prediction.id, ciphertext.handles[0], ciphertext.inputProof, {
        value: parseEther(stakeAmount),
      });
      await tx.wait();

      setActionMessage('Bet submitted successfully!');
      setSelectedOption(null);
      setStakeAmount('0.01');
      await onActionComplete();
    } catch (error) {
      console.error('Failed to place bet', error);
      setActionMessage('Bet failed. Please try again.');
    } finally {
      setIsPlacingBet(false);
    }
  };

  const handleDecryptCounts = async () => {
    try {
      ensurePrerequisites();
      const client = publicClient as PublicClient;

      setIsDecryptingCounts(true);

      const resolvedSigner = await ensureSigner();
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, resolvedSigner);
      const tx = await contract.requestOptionCountAccess(prediction.id);
      await tx.wait();

      const encryptedCounts = (await client.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getEncryptedOptionCounts',
        args: [BigInt(prediction.id)],
      })) as string[];

      const results = await executeUserDecrypt(encryptedCounts);
      const counts = encryptedCounts.map((handle) => Number(results[handle] ?? '0'));
      setDecryptedCounts(counts);
      setActionMessage('Counts decrypted successfully.');
    } catch (error) {
      console.error('Failed to decrypt counts', error);
      setActionMessage('Unable to decrypt counts right now.');
    } finally {
      setIsDecryptingCounts(false);
    }
  };

  const handleDecryptSelection = async () => {
    try {
      ensurePrerequisites();
      const client = publicClient as PublicClient;
      const userAddress = account as HexAddress;

      setIsDecryptingSelection(true);

      const resolvedSigner = await ensureSigner();
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, resolvedSigner);
      const tx = await contract.requestBetAccess(prediction.id);
      await tx.wait();

      const bet = (await client.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getBet',
        args: [BigInt(prediction.id), userAddress],
      })) as BetResponse;

      if (!bet || !bet.exists) {
        setActionMessage('You have not placed a bet on this prediction.');
        return;
      }

      const result = await executeUserDecrypt([bet.encryptedChoice]);
      const rawSelection = result[bet.encryptedChoice];
      if (rawSelection) {
        setMySelection(Number(rawSelection));
        setActionMessage('Your encrypted selection was decrypted.');
      }
    } catch (error) {
      console.error('Failed to decrypt selection', error);
      setActionMessage('Unable to decrypt your selection.');
    } finally {
      setIsDecryptingSelection(false);
    }
  };

  return (
    <article className="prediction-card">
      <header className="card-header">
        <div>
          <div className="card-pill">{isActive ? 'Active' : 'Closed'}</div>
          <h3>{prediction.name}</h3>
          <p className="creator">Created by {formatAddress(prediction.creator)}</p>
        </div>
        <div className="card-metrics">
          <div>
            <p className="metric-label">Participants</p>
            <p className="metric-value">{prediction.totalParticipants}</p>
          </div>
          <div>
            <p className="metric-label">Total stake</p>
            <p className="metric-value">{formatEther(prediction.totalStake)} ETH</p>
          </div>
        </div>
      </header>

      <div className="options-list">
        {prediction.options.map((option, index) => (
          <label
            key={index}
            className={`option-row ${
              selectedOption === index ? 'selected' : ''
            } ${winningOption === index ? 'winner' : ''}`}
          >
            <div className="option-info">
              <input
                type="radio"
                name={`prediction-${prediction.id}`}
                value={index}
                disabled={!isActive}
                checked={selectedOption === index}
                onChange={() => setSelectedOption(index)}
              />
              <span>{option}</span>
            </div>
            {winningOption === index && <span className="winner-badge">Winning option</span>}
            {decryptedCounts && (
              <span className="count-pill">{decryptedCounts[index] ?? 0} picks</span>
            )}
          </label>
        ))}
      </div>

      <div className="bet-row">
        <input
          type="number"
          className="text-input"
          min="0"
          step="0.01"
          value={stakeAmount}
          onChange={(event) => setStakeAmount(event.target.value)}
          placeholder="0.10"
        />
        <button className="primary-button" onClick={handlePlaceBet} disabled={!isActive || isPlacingBet}>
          {isPlacingBet ? 'Submitting...' : 'Place encrypted bet'}
        </button>
      </div>

      <div className="action-grid">
        <button className="ghost-button" onClick={handleDecryptCounts} disabled={isDecryptingCounts}>
          {isDecryptingCounts ? 'Decrypting...' : 'Decrypt option counts'}
        </button>
        <button className="ghost-button" onClick={handleDecryptSelection} disabled={isDecryptingSelection}>
          {isDecryptingSelection ? 'Decrypting...' : 'Decrypt my selection'}
        </button>
      </div>

      {mySelection !== null && (
        <div className="success-banner">
          You picked <strong>{prediction.options[mySelection]}</strong>
        </div>
      )}

      {actionMessage && <p className="action-message">{actionMessage}</p>}
    </article>
  );
}
