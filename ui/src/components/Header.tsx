import { ConnectButton } from '@rainbow-me/rainbowkit';

import '../styles/Header.css';

type Props = {
  totalPredictions: number;
  activePredictions: number;
  totalStakeEth: string;
};

export function Header({ totalPredictions, activePredictions, totalStakeEth }: Props) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="hero-copy">
          <p className="eyebrow">Proof of Prediction</p>
          <h1>Encrypted prediction markets secured by Zama FHE</h1>
          <p className="hero-subtitle">
            Publish outcomes, let anyone bet with ETH, and keep picks private until you authorize decryption.
          </p>
          <div className="hero-stats">
            <div>
              <p className="stat-label">Active predictions</p>
              <p className="stat-value">{activePredictions}</p>
            </div>
            <div>
              <p className="stat-label">Total predictions</p>
              <p className="stat-value">{totalPredictions}</p>
            </div>
            <div>
              <p className="stat-label">Total stakes (ETH)</p>
              <p className="stat-value">{parseFloat(totalStakeEth).toFixed(4)}</p>
            </div>
          </div>
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}
