import { useMemo } from 'react';
import { useAccount, usePublicClient, useReadContract } from 'wagmi';
import { formatEther } from 'viem';

import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import { Header } from './Header';
import { CreatePredictionForm } from './CreatePredictionForm';
import { PredictionCard } from './PredictionCard';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import '../styles/PredictionApp.css';

export type PredictionMetadata = {
  id: number;
  name: string;
  options: string[];
  status: number;
  totalStake: bigint;
  totalParticipants: number;
  hasResult: boolean;
  resultIndex: number;
  creator: string;
};

type RawPrediction = {
  name: string;
  options: readonly string[];
  status: number;
  totalStake: bigint;
  totalParticipants: bigint;
  hasResult: boolean;
  resultIndex: bigint;
  creator: string;
};

export function PredictionApp() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const signer = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const {
    data: rawPredictions,
    refetch,
    isPending,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getAllPredictions',
  });

  const predictions: PredictionMetadata[] = useMemo(() => {
    if (!rawPredictions) {
      return [];
    }

    const typedPredictions = Array.from(rawPredictions as readonly RawPrediction[]);
    return typedPredictions.map((prediction, index) => ({
      id: index,
      name: prediction.name,
      options: prediction.options.map((option) => option.toString()),
      status: Number(prediction.status),
      totalStake: prediction.totalStake,
      totalParticipants: Number(prediction.totalParticipants),
      hasResult: prediction.hasResult,
      resultIndex: prediction.hasResult ? Number(prediction.resultIndex) : -1,
      creator: prediction.creator,
    }));
  }, [rawPredictions]);

  const totalStake = predictions.reduce((acc, prediction) => acc + prediction.totalStake, 0n);
  const activePredictions = predictions.filter((prediction) => prediction.status === 0).length;

  return (
    <div className="prediction-app">
      <Header
        totalPredictions={predictions.length}
        activePredictions={activePredictions}
        totalStakeEth={formatEther(totalStake)}
      />

      <main className="prediction-main">
        <section className="panel">
          <h2 className="panel-title">Create a Prediction</h2>
          <p className="panel-description">
            Launch a new encrypted prediction with up to four outcomes. Bets stay private thanks to Zama FHE.
          </p>
          <CreatePredictionForm
            signer={signer}
            isConnected={isConnected}
            onCreated={refetch}
          />
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Live Predictions</h2>
              <p className="panel-description">
                Place encrypted bets and decrypt aggregated picks whenever you need clarity.
              </p>
            </div>
          </div>

          {zamaError && (
            <div className="status-banner error">
              Encryption service failed to initialize. Please refresh the page.
            </div>
          )}

          {zamaLoading && !instance && (
            <div className="status-banner">Preparing secure encryption channel...</div>
          )}

          {isPending ? (
            <div className="status-banner">Loading predictions from chain...</div>
          ) : predictions.length === 0 ? (
            <div className="empty-state">
              <p>No predictions yet. Be the first to publish one!</p>
            </div>
          ) : (
            <div className="prediction-list">
              {predictions.map((prediction) => (
                <PredictionCard
                  key={prediction.id}
                  prediction={prediction}
                  account={address}
                  signer={signer}
                  instance={instance}
                  publicClient={publicClient}
                  onActionComplete={refetch}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
