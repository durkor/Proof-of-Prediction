import { useState } from 'react';
import type { FormEvent } from 'react';
import { Contract } from 'ethers';

import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';

type Props = {
  signer: Promise<any> | undefined;
  isConnected: boolean;
  onCreated: () => Promise<unknown> | unknown;
};

export function CreatePredictionForm({ signer, isConnected, onCreated }: Props) {
  const [name, setName] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const handleOptionChange = (index: number, value: string) => {
    setOptions((prev) => prev.map((option, idx) => (idx === index ? value : option)));
  };

  const handleAddOption = () => {
    if (options.length < 4) {
      setOptions((prev) => [...prev, '']);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) {
      return;
    }
    setOptions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormMessage(null);

    if (!signer || !isConnected) {
      setFormMessage('Connect your wallet to create a prediction.');
      return;
    }

    const trimmedName = name.trim();
    const preparedOptions = options.map((option) => option.trim()).filter((option) => option.length > 0);

    if (trimmedName.length === 0) {
      setFormMessage('Prediction title is required.');
      return;
    }

    if (preparedOptions.length < 2 || preparedOptions.length > 4) {
      setFormMessage('Enter between 2 and 4 options.');
      return;
    }

    setIsSubmitting(true);

    try {
      const resolvedSigner = await signer;
      if (!resolvedSigner) {
        throw new Error('Signer unavailable');
      }

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, resolvedSigner);
      const tx = await contract.createPrediction(trimmedName, preparedOptions);
      await tx.wait();

      setName('');
      setOptions(['', '']);
      setFormMessage('Prediction created successfully!');
      await onCreated();
    } catch (error) {
      console.error('Failed to create prediction', error);
      setFormMessage('Failed to create prediction. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="create-form" onSubmit={handleSubmit}>
      <label className="form-label">
        Prediction title
        <input
          type="text"
          className="text-input"
          placeholder="Who wins the next match?"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <div className="options-header">
        <span>Options ({options.length}/4)</span>
        {options.length < 4 && (
          <button type="button" className="ghost-button" onClick={handleAddOption}>
            + Add option
          </button>
        )}
      </div>

      <div className="options-grid">
        {options.map((option, index) => (
          <div key={index} className="option-row">
            <input
              type="text"
              className="text-input"
              placeholder={`Option ${index + 1}`}
              value={option}
              onChange={(event) => handleOptionChange(index, event.target.value)}
            />
            {options.length > 2 && (
              <button
                type="button"
                className="ghost-button danger"
                onClick={() => handleRemoveOption(index)}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      <button type="submit" className="primary-button" disabled={isSubmitting}>
        {isSubmitting ? 'Publishing...' : 'Publish Prediction'}
      </button>

      {formMessage && <p className="form-message">{formMessage}</p>}
    </form>
  );
}
