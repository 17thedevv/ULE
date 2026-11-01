import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExamTakingView } from '../../components/exam/ExamTakingView';
import { ErrorState } from '../../components/states/ErrorState';

export default function ExamTakingPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  if (!attemptId) {
    return (
      <ErrorState
        title="Invalid Examination Attempt"
        message="No examination attempt ID was specified."
        onRetry={() => navigate('/app/exams')}
      />
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 0.5rem' }}>
      <ExamTakingView
        attemptId={attemptId}
        onFinish={() => {
          navigate(`/app/exams/attempts/${attemptId}/result`);
        }}
        onCancel={() => {
          navigate('/app/exams');
        }}
      />
    </div>
  );
}
