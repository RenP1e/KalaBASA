(function () {
  const labels = { uploading: 'Uploading documents', extracting_text: 'Extracting text', identifying_information: 'Identifying information', validating_compliance: 'Validating compliance', generating_findings: 'Generating findings', assessment_completed: 'Assessment completed', manual_review_required: 'Manual review required', local_ai_unavailable: 'Local AI service unavailable' };
  KB.processingLabels = labels;
  KB.ai.register('local', async ({ files, signal, config, applicationType, onProgress }) => {
    const body = new FormData(); files.forEach(f => body.append('files', f, f.name)); body.append('applicationType', applicationType || 'new');
    onProgress && onProgress(labels.uploading);
    const job = await KB.api(config.endpoint, { method: 'POST', body, signal });
    for (;;) {
      const application = await KB.api(`${config.endpoint}/${job.id}`, { signal });
      onProgress && onProgress(labels[application.processingState] || 'Processing locally');
      if (['assessment_completed', 'manual_review_required', 'local_ai_unavailable'].includes(application.processingState)) {
        if (!application.analysis.analyzedAt) throw new KB.ai.AIError('Assessment requires manual review after a processing error. Open My Reports or Applications to inspect and retry.');
        return Object.assign({}, application.analysis, { application, findings: application.findings, humanReviewRequired: true });
      }
      await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1200);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
    }
  });
})();
