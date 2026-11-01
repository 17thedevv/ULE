import React from 'react';
import { ExamAttemptQuestionItemDto } from '@ule/contracts';
import { SingleChoiceQuestion } from './questions/SingleChoiceQuestion';
import { MultipleChoiceQuestion } from './questions/MultipleChoiceQuestion';
import { TrueFalseQuestion } from './questions/TrueFalseQuestion';
import { ClozeQuestion } from './questions/ClozeQuestion';
import { NumericQuestion } from './questions/NumericQuestion';
import { MatchingQuestion } from './questions/MatchingQuestion';
import { OrderingQuestion } from './questions/OrderingQuestion';
import { ShortTextQuestion } from './questions/ShortTextQuestion';
import { EssayQuestion } from './questions/EssayQuestion';

interface QuestionRendererProps {
  item: ExamAttemptQuestionItemDto;
  value: Record<string, unknown> | null;
  onChange: (payload: Record<string, unknown>) => void;
  disabled?: boolean;
}

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  item,
  value,
  onChange,
  disabled = false,
}) => {
  const renderInput = () => {
    switch (item.type) {
      case 'SINGLE_CHOICE':
        return (
          <SingleChoiceQuestion
            content={item.content}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case 'MULTIPLE_CHOICE':
        return (
          <MultipleChoiceQuestion
            content={item.content}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case 'TRUE_FALSE':
        return (
          <TrueFalseQuestion
            content={item.content}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case 'CLOZE':
        return (
          <ClozeQuestion
            content={item.content}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case 'NUMERIC':
        return (
          <NumericQuestion
            content={item.content}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case 'MATCHING':
        return (
          <MatchingQuestion
            content={item.content}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case 'ORDERING':
        return (
          <OrderingQuestion
            content={item.content}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case 'SHORT_TEXT':
        return (
          <ShortTextQuestion
            content={item.content}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case 'ESSAY':
        return (
          <EssayQuestion
            content={item.content}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        );
      default:
        return (
          <div className="alert alert-warning">
            Unsupported question type: {(item as { type: string }).type}
          </div>
        );
    }
  };

  return (
    <div className="question-card" data-testid={`question-item-${item.id}`}>
      <div className="question-header">
        <div className="question-title-row">
          <span className="question-number">#{item.orderIndex + 1}</span>
          <h3 className="question-title">{item.title}</h3>
          <span className="question-points">({item.points} pts)</span>
          {item.isRequired && <span className="tag-required">*Required</span>}
        </div>
        {item.prompt && <p className="question-prompt">{item.prompt}</p>}
      </div>
      <div className="question-body">{renderInput()}</div>
    </div>
  );
};
