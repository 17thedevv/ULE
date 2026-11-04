import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BlockPreview } from './BlockPreview';

describe('BlockPreview', () => {
  it('renders MCQ preview with questions and options without exposing answers by default', () => {
    const config = {
      question: 'What is 5 * 5?',
      options: [
        { id: 'opt_1', text: '20' },
        { id: 'opt_2', text: '25' },
        { id: 'opt_3', text: '30' },
      ],
      answerKey: {
        correctOptionId: 'opt_2',
        explanation: '5 multiplied by 5 is 25.',
      },
    };

    const onClose = vi.fn();
    render(
      <BlockPreview
        blockTypeId="multiple-choice"
        title="Math Question"
        config={config}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('What is 5 * 5?')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();

    // Answer key must NOT be visible by default in learner preview
    expect(screen.queryByText('✓ Creator Answer Key')).not.toBeInTheDocument();
    expect(screen.queryByText(/5 multiplied by 5 is 25/i)).not.toBeInTheDocument();

    // Toggling reveal answer key shows it for the author
    const toggleBtn = screen.getByText(/Reveal Creator Answer Key/i);
    fireEvent.click(toggleBtn);

    expect(screen.getByText(/✓ Creator Answer Key/i)).toBeInTheDocument();
    expect(screen.getByText(/5 multiplied by 5 is 25/i)).toBeInTheDocument();

    // Clicking close invokes onClose
    const closeBtns = screen.getAllByRole('button', { name: /Close Preview/i });
    fireEvent.click(closeBtns[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders Cloze preview with interactive blank input fields', () => {
    const config = {
      prompt: 'Complete the sentence.',
      templateText: 'Water freezes at {{blank_1}} degrees Celsius.',
      targetBlanks: [{ id: 'b_1', blankKey: 'blank_1', hintText: 'A round number' }],
      answerKey: {
        blanks: { blank_1: ['0', 'zero'] },
      },
    };

    render(
      <BlockPreview
        blockTypeId="cloze"
        title="Physics Activity"
        config={config}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Complete the sentence/i)).toBeInTheDocument();
    expect(screen.getByText(/Water freezes at/i)).toBeInTheDocument();
    expect(screen.getByText(/degrees Celsius/i)).toBeInTheDocument();

    const blankInput = screen.getByLabelText(/Blank blank_1/i) as HTMLInputElement;
    expect(blankInput).toBeInTheDocument();

    // Learner can type in preview
    fireEvent.change(blankInput, { target: { value: '0' } });
    expect(blankInput.value).toBe('0');
  });

  it('renders Video preview with normalized embed iframe for YouTube', () => {
    const config = {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      durationSeconds: 212,
      transcript: 'Full transcript text for video.',
    };

    render(
      <BlockPreview
        blockTypeId="video"
        title="Introductory Video"
        config={config}
        onClose={vi.fn()}
      />,
    );

    const iframe = screen.getByTitle('Introductory Video') as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.src).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(screen.getByText(/Duration: 212s/i)).toBeInTheDocument();
    expect(screen.getByText(/Full transcript text for video/i)).toBeInTheDocument();
  });
});
