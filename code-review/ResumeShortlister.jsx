import React, { useEffect, useState } from 'react';
import { Upload, FileText, Users, Target, CheckCircle, XCircle, User, Award, AlertTriangle, Trophy, BarChart3, FileSearch, Download } from 'lucide-react';
import './ResumeShortlister.css'; // Import the CSS file
import Layout from '../../components/Layout/Layout';
import CustomFetch from '../../CustomFetch';


const ResumeShortlister = () => {
const [files, setFiles] = useState([]);
const [jobDescription, setJobDescription] = useState('');
const [minScore, setMinScore] = useState(60);
const [uploadedCount, setUploadedCount] = useState(0);
const [summaries, setSummaries] = useState([]);
const [keywordMatches, setKeywordMatches] = useState([]);
const [loading, setLoading] = useState(false);
const [downloadingReport, setDownloadingReport] = useState(false);
const [activeTab, setActiveTab] = useState('upload');
const [resultsTab, setResultsTab] = useState('summary'); // New state for results sub-tabs
const [downloading , setDownloading] = useState(false)
const [hasPageReloaded,setHasPageReloaded] = useState(true)

const handleFileUpload = (event) => {
    const selectedFiles = Array.from(event.target.files);
    setFiles(selectedFiles);
};

const uploadFiles = async () => {
    if (files.length === 0) {
        alert('Please select files to upload');
        return;
    }

    setLoading(true);
    const formData = new FormData();
    files.forEach(file => {
        formData.append('files', file);
    });
    formData.append("has_page_reloaded", hasPageReloaded);
    setHasPageReloaded(false);
    
    try {
        const response = await CustomFetch(`${import.meta.env.VITE_API_URL}/admin/resume/upload`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
        });

        // Check if response exists
        if (!response) {
            throw new Error('No response received from server');
        }

        // Check if response is ok before trying to parse JSON
        if (response.ok) {
            const data = await response.json();
            setUploadedCount(data.total_resumes || data.resumes?.length || 0);
            setActiveTab('process');
            alert(data.message || 'Files uploaded successfully');
        } else {
            // Try to parse error message, but handle case where response might not be JSON
            let errorMessage = 'Upload failed';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (jsonError) {
                // If JSON parsing fails, use status text or generic message
                errorMessage = response.statusText || `HTTP ${response.status}: Upload failed`;
            }
            alert(errorMessage);
        }
    } catch (error) {
        console.error('Upload error:', error);
        
        // More specific error messages
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            alert('Network error: Unable to connect to server. Please check your connection.');
        } else if (error.message.includes('json')) {
            alert('Server response error: Invalid response format.');
        } else {
            alert('Upload failed: ' + (error.message || 'Unknown error occurred'));
        }
    } finally {
        setLoading(false);
    }
};

const generateSummary = async () => {
    if (!jobDescription.trim()) {
    alert('Please enter job description');
    return;
    }

    setLoading(true);
    try {
    // First generate keyword matches
    const keywordResponse = await CustomFetch(`${import.meta.env.VITE_API_URL}/admin/resume/generate_keyword_match`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        job_description: jobDescription,
        min_score: minScore
        }),
    });
    const keywordData = await keywordResponse.json();
    setKeywordMatches(keywordData);
    console.log("keyword matches",keywordData)

    // Then generate HR summaries only for accepted candidates
    const summaryResponse = await CustomFetch(`${import.meta.env.VITE_API_URL}/admin/resume/generate_hr_summary`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        job_description: jobDescription,
        min_score:minScore
        }),
    });
    const summaryData = await summaryResponse.json();
    setSummaries(summaryData);
    
    setActiveTab('results');
    setResultsTab('summary'); // Reset to summary tab when results are generated
    } catch (error) {
    alert('Generation failed: ' + error.message);
    }
    setLoading(false);
};

const downloadPdfReport = async () => {
    if (keywordMatches.length === 0) {
        alert('No data available for report generation');
        return;
    }

    setDownloadingReport(true);
    try {
        const reportData = {
            hr_summary: summaries.map(item => ({
                summary: {
                    name: item.summary?.name || 'N/A',
                    evaluation: item.summary?.evaluation || 'N/A',
                    strengths: item.summary?.strengths || [],
                    weaknesses: item.summary?.weaknesses || []
                }
            })),
            keywords_matched: keywordMatches.map(item => ({
                result: {
                    name: item.result?.name || 'N/A',
                    score: item.result?.score || 0,
                    reason: item.result?.reason || 'N/A',
                    keywords_matching: item.result?.keywords_matching || [],
                    missing_keywords: item.result?.missing_keywords || []
                }
            })),
            min_score:minScore,
        };

        const response = await CustomFetch(`${import.meta.env.VITE_API_URL}/admin/resume/generate_pdf_report`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(reportData),
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Failed to generate report');
        }

        const pdfBlob = await response.blob();
        const url = window.URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `resume_analysis_report_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        alert('Report generation failed: ' + error.message);
    }
    setDownloadingReport(false);
};

const acceptedCandidates = keywordMatches.filter(match => 
    match.result && match.result.score >= minScore
);

const rejectedCandidates = keywordMatches.filter(match => 
    match.result && match.result.score < minScore
);

// Sort all candidates by score for ranklist
const rankedCandidates = [...keywordMatches].sort((a, b) => 
    (b.result?.score || 0) - (a.result?.score || 0)
);

const getSummaryForCandidate = (filename) => {
    return summaries.find(summary => summary.filename === filename);
};

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const response = await CustomFetch(`${url}/generate_html_report`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ scorecard: scorecardHTML }),
            });

            if (!response.ok) throw new Error('Download failed');

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.setAttribute('download', 'interview_scorecard.pdf');
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);
        } catch (err) {
            console.error('Error downloading PDF:', err);
            setError('Failed to download PDF. Please try again.');
        } finally {
            setDownloading(false);
        }
    };
return (
    <Layout>
        <div className="resume-app-container">
        <div className="resume-container">
            <div className="resume-header">
            <h1 className="resume-main-title">
                AI Resume Shortlister
            </h1>
            <p className="resume-subtitle">Streamline your hiring process with intelligent resume screening</p>
            </div>

            {/* Navigation Tabs */}
            <div className="resume-nav-container">
            <div className="resume-nav-tabs">
                {['upload', 'process', 'results'].map((tab, index) => (
                <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    disabled={(tab === 'process' && uploadedCount === 0) || (tab === 'results' && keywordMatches.length === 0)}
                    className={`resume-nav-tab ${activeTab === tab ? 'resume-nav-tab-active' : ''}`}
                >
                    {tab === 'upload' && <Upload className="resume-nav-icon" />}
                    {tab === 'process' && <Target className="resume-nav-icon" />}
                    {tab === 'results' && <Users className="resume-nav-icon" />}
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
                ))}
            </div>
            </div>

            {/* Upload Section */}
            {activeTab === 'upload' && (
            <div className="resume-section-container">
                <div className="resume-card">
                <div className="resume-upload-header">
                    <div className="resume-upload-icon">
                    <FileText className="resume-icon-large" />
                    </div>
                    <h2 className="resume-section-title">Upload Resumes</h2>
                    <p className="resume-section-subtitle">Select PDF/docxfiles to analyze</p>
                </div>

                <div className="resume-upload-area">
                    <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleFileUpload}
                    className="resume-file-input"
                    id="file-upload"
                    />
                    <label htmlFor="file-upload" className="resume-file-label">
                    <Upload className="resume-upload-icon-large" />
                    <p className="resume-upload-text">Click to select PDF/docx files</p>
                    <p className="resume-upload-subtext">Multiple files supported</p>
                    </label>
                </div>

                {files.length > 0 && (
                    <div className="resume-files-section">
                    <h3 className="resume-files-title">Selected Files ({files.length})</h3>
                    <div className="resume-files-list">
                        {files.map((file, index) => (
                        <div key={index} className="resume-file-item">
                            <FileText className="resume-file-icon" />
                            <span className="resume-file-name">{file.name}</span>
                            <span className="resume-file-size">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                        </div>
                        ))}
                    </div>
                    
                    <button
                        onClick={uploadFiles}
                        disabled={loading}
                        className="resume-upload-btn"
                    >
                        {loading ? 'Uploading...' : 'Upload Files'}
                    </button>
                    </div>
                )}

                {uploadedCount > 0 && (
                    <div className="resume-success-message">
                    <div className="resume-success-content">
                        <CheckCircle className="resume-success-icon" />
                        <span className="resume-success-text">
                        Successfully uploaded {uploadedCount} resumes
                        </span>
                    </div>
                    </div>
                )}
                </div>
            </div>
            )}

            {/* Process Section */}
            {activeTab === 'process' && (
            <div className="resume-process-container">
                <div className="resume-card">
                <div className="resume-process-header">
                    <div className="resume-process-icon">
                    <Target className="resume-icon-large" />
                    </div>
                    <h2 className="resume-section-title">Configure Analysis</h2>
                    <p className="resume-section-subtitle">Set job requirements and scoring criteria</p>
                </div>

                <div className="resume-form-section">
                    <div className="resume-form-group">
                    <label className="resume-form-label">
                        Job Description & Requirements
                    </label>
                    <textarea
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                        className="resume-job-textarea"
                        placeholder="Enter detailed job description, required skills, experience, qualifications, and any specific requirements..."
                    />
                    </div>

                    <div className="resume-form-group">
                    <label className="resume-form-label">
                        Minimum ATS Score: {minScore}%
                    </label>
                    <div className="resume-slider-container">
                        <input
                        type="range"
                        min="0"
                        max="100"
                        value={minScore}
                        onChange={(e) => setMinScore(parseInt(e.target.value))}
                        className="resume-score-slider"
                        />
                        <div className="resume-slider-labels">
                        <span>0%</span>
                        <span>25%</span>
                        <span>50%</span>
                        <span>75%</span>
                        <span>100%</span>
                        </div>
                    </div>
                    <div className="resume-score-info">
                        <p className="resume-score-text">
                        Candidates scoring {minScore}% or above will be accepted and receive detailed HR analysis
                        </p>
                    </div>
                    </div>

                    <button
                    onClick={generateSummary}
                    disabled={loading || !jobDescription.trim()}
                    className="resume-analyze-btn"
                    >
                    {loading ? 'Analyzing Resumes...' : 'Generate Analysis'}
                    </button>
                </div>
                </div>
            </div>
            )}

            {/* Results Section */}
            {activeTab === 'results' && (
            <div className="resume-results-container">
                {/* Summary Cards */}
                <div className="resume-stats-grid">
                <div className="resume-stat-card">
                    <div className="resume-stat-content">
                    <div className="resume-stat-icon resume-total">
                        <Users className="resume-stat-icon-svg" />
                    </div>
                    <div className="resume-stat-info">
                        <p className="resume-stat-label">Total Candidates</p>
                        <p className="resume-stat-value">{keywordMatches.length}</p>
                    </div>
                    </div>
                </div>

                <div className="resume-stat-card">
                    <div className="resume-stat-content">
                    <div className="resume-stat-icon resume-accepted">
                        <CheckCircle className="resume-stat-icon-svg" />
                    </div>
                    <div className="resume-stat-info">
                        <p className="resume-stat-label">Accepted</p>
                        <p className="resume-stat-value resume-accepted-value">{acceptedCandidates.length}</p>
                    </div>
                    </div>
                </div>

                <div className="resume-stat-card">
                    <div className="resume-stat-content">
                    <div className="resume-stat-icon resume-rejected">
                        <XCircle className="resume-stat-icon-svg" />
                    </div>
                    <div className="resume-stat-info">
                        <p className="resume-stat-label">Rejected</p>
                        <p className="resume-stat-value resume-rejected-value">{rejectedCandidates.length}</p>
                    </div>
                    </div>
                </div>
                </div>

                {/* Download Report Button */}
                <div className="resume-download-section">
                    
                    <button
                        onClick={downloadPdfReport}
                        disabled={downloadingReport || keywordMatches.length === 0}
                        className="resume-download-btn"
                    >
                        <Download className="resume-download-icon" />
                        {downloadingReport ? 'Generating Report...' : 'Download PDF Report'}
                    </button>
                </div>
                 
                {/* Results Sub-Navigation */}
                <div className="resume-results-nav-container">
                    


                <div className="resume-results-nav-tabs">
                    <button
                    onClick={() => setResultsTab('summary')}
                    className={`resume-results-nav-tab ${resultsTab === 'summary' ? 'resume-results-nav-tab-active' : ''}`}
                    >
                    <Award className="resume-nav-icon" />
                    HR Summary
                    </button>
                    <button
                    onClick={() => setResultsTab('ranklist')}
                    className={`resume-results-nav-tab ${resultsTab === 'ranklist' ? 'resume-results-nav-tab-active' : ''}`}
                    >
                    <Trophy className="resume-nav-icon" />
                    Ranklist
                    </button>
                    <button
                    onClick={() => setResultsTab('accepted')}
                    className={`resume-results-nav-tab ${resultsTab === 'accepted' ? 'resume-results-nav-tab-active' : ''}`}
                    >
                    <CheckCircle className="resume-nav-icon" />
                    Accepted ({acceptedCandidates.length})
                    </button>
                    <button
                    onClick={() => setResultsTab('rejected')}
                    className={`resume-results-nav-tab ${resultsTab === 'rejected' ? 'resume-results-nav-tab-active' : ''}`}
                    >
                    <XCircle className="resume-nav-icon" />
                    Rejected ({rejectedCandidates.length})
                    </button>
                </div>
                </div>

                {/* HR Summary Tab */}
                {resultsTab === 'summary' && (
                <div className="resume-tab-content">
                    <div className="resume-section-card">
                    <div className="resume-section-card-header">
                        <Award className="resume-section-icon" />
                        <h2 className="resume-section-card-title">HR Summary - Accepted Candidates</h2>
                        <p className="resume-section-card-subtitle">Detailed evaluation for qualified candidates</p>
                    </div>
                    
                    <div className="resume-hr-summary-list">
                        {acceptedCandidates.map((candidate, index) => {
                        const summary = getSummaryForCandidate(candidate.filename);
                        return (
                            <div key={index} className="resume-hr-summary-card">
                            <div className="resume-hr-summary-header">
                                <div className="resume-candidate-info">
                                <div className="resume-candidate-avatar resume-accepted-avatar">
                                    <User className="resume-avatar-icon" />
                                </div>
                                <div className="resume-candidate-details">
                                    <h3 className="resume-candidate-name">
                                    {candidate.result.name || candidate.filename}
                                    </h3>
                                    <p className="resume-candidate-filename">{candidate.filename}</p>
                                </div>
                                </div>
                                <div className="resume-score-badge resume-accepted-badge">
                                <Award className="resume-badge-icon" />
                                <span className="resume-badge-text">{candidate.result.score}%</span>
                                </div>
                            </div>

                            {summary && summary.summary && (
                                <div className="resume-hr-evaluation">
                                <div className="resume-evaluation-text">
                                    <h4 className="resume-evaluation-title">HR Evaluation</h4>
                                    <p className="resume-evaluation-description">{summary.summary.evaluation}</p>
                                </div>
                                
                                <div className="resume-evaluation-details">
                                    <div className="resume-strengths">
                                    <p className="resume-eval-label resume-strengths-label">Strengths:</p>
                                    <ul className="resume-eval-list">
                                        {summary.summary.strengths?.map((strength, i) => (
                                        <li key={i} className="resume-eval-item">• {strength}</li>
                                        ))}
                                    </ul>
                                    </div>
                                    
                                    <div className="resume-weaknesses">
                                    <p className="resume-eval-label resume-weaknesses-label">Areas for consideration:</p>
                                    <ul className="resume-eval-list">
                                        {summary.summary.weaknesses?.map((weakness, i) => (
                                        <li key={i} className="resume-eval-item">• {weakness}</li>
                                        ))}
                                    </ul>
                                    </div>
                                </div>
                                </div>
                            )}
                            </div>
                        );
                        })}
                        
                        {acceptedCandidates.length === 0 && (
                        <div className="resume-empty-state">
                            <Award className="resume-empty-icon" />
                            <p className="resume-empty-text">No accepted candidates found</p>
                            <p className="resume-empty-subtext">Try lowering the minimum score threshold</p>
                        </div>
                        )}
                    </div>
                    </div>
                </div>
                )}

                {/* Ranklist Tab */}
                {resultsTab === 'ranklist' && (
                <div className="resume-tab-content">
                    <div className="resume-section-card">
                    <div className="resume-section-card-header">
                        <Trophy className="resume-section-icon" />
                        <h2 className="resume-section-card-title">Candidate Ranklist</h2>
                        <p className="resume-section-card-subtitle">All candidates ranked by ATS score</p>
                    </div>
                    
                    <div className="resume-ranklist">
                        {rankedCandidates.map((candidate, index) => (
                        <div key={index} className={`resume-ranklist-item ${candidate.result.score >= minScore ? 'resume-ranklist-accepted' : 'resume-ranklist-rejected'}`}>
                            <div className="resume-ranklist-rank">
                            <span className="resume-rank-number">#{index + 1}</span>
                            </div>
                            
                            <div className="resume-ranklist-candidate">
                            <div className="resume-candidate-avatar">
                                <User className="resume-avatar-icon" />
                            </div>
                            <div className="resume-candidate-details">
                                <h3 className="resume-candidate-name">
                                {candidate.result.name || candidate.filename}
                                </h3>
                                <p className="resume-candidate-filename">{candidate.filename}</p>
                            </div>
                            </div>
                            
                            <div className="resume-ranklist-score">
                            <div className={`resume-score-badge ${candidate.result.score >= minScore ? 'resume-accepted-badge' : 'resume-rejected-badge'}`}>
                                {candidate.result.score >= minScore ? 
                                <CheckCircle className="resume-badge-icon" /> : 
                                <XCircle className="resume-badge-icon" />
                                }
                                <span className="resume-badge-text">{candidate.result.score}%</span>
                            </div>
                            </div>
                        </div>
                        ))}
                    </div>
                    </div>
                </div>
                )}

                {/* Accepted Candidates Tab */}
                {resultsTab === 'accepted' && (
                <div className="resume-tab-content">
                    <div className="resume-section-card">
                    <div className="resume-section-card-header resume-accepted-header">
                        <CheckCircle className="resume-section-icon" />
                        <h2 className="resume-section-card-title">Accepted Candidates</h2>
                        <p className="resume-section-card-subtitle">Detailed keyword analysis for qualified candidates</p>
                    </div>
                    
                    <div className="resume-candidates-grid">
                        {acceptedCandidates.map((candidate, index) => (
                        <div key={index} className="resume-keyword-analysis-card">
                            <div className="resume-candidate-header">
                            <div className="resume-candidate-info">
                                <div className="resume-candidate-avatar resume-accepted-avatar">
                                <User className="resume-avatar-icon" />
                                </div>
                                <div className="resume-candidate-details">
                                <h3 className="resume-candidate-name">
                                    {candidate.result.name || candidate.filename}
                                </h3>
                                <p className="resume-candidate-filename">{candidate.filename}</p>
                                </div>
                            </div>
                            <div className="resume-score-badge resume-accepted-badge">
                                <Award className="resume-badge-icon" />
                                <span className="resume-badge-text">{candidate.result.score}%</span>
                            </div>
                            </div>

                            <div className="resume-keyword-analysis">
                            <h4 className="resume-analysis-title">ATS Analysis</h4>
                            <p className="resume-analysis-text">{candidate.result.reason}</p>
                            
                            {/* Show matching keywords for accepted candidates */}
                            {candidate.result.keywords_matching && candidate.result.keywords_matching.length > 0 && (
                                <div className="resume-keywords-section">
                                <p className="resume-keywords-label">✅ Matching Keywords</p>
                                <div className="resume-keywords-list">
                                    {candidate.result.keywords_matching.map((keyword, i) => (
                                    <span key={i} className="resume-keyword-tag resume-matching">
                                        {keyword}
                                    </span>
                                    ))}
                                </div>
                                </div>
                            )}

                            {/* Also show missing keywords for accepted candidates (for completeness) */}
                            {candidate.result.missing_keywords && candidate.result.missing_keywords.length > 0 && (
                                <div className="resume-keywords-section">
                                <p className="resume-keywords-label">⚠️ Areas for Improvement</p>
                                <div className="resume-keywords-list">
                                    {candidate.result.missing_keywords.map((keyword, i) => (
                                    <span key={i} className="resume-keyword-tag resume-missing">
                                        {keyword}
                                    </span>
                                    ))}
                                </div>
                                </div>
                            )}
                            </div>
                        </div>
                        ))}
                        
                        {acceptedCandidates.length === 0 && (
                        <div className="resume-empty-state">
                            <CheckCircle className="resume-empty-icon" />
                            <p className="resume-empty-text">No accepted candidates found</p>
                            <p className="resume-empty-subtext">Try lowering the minimum score threshold</p>
                        </div>
                        )}
                    </div>
                    </div>
                </div>
                )}

                {/* Rejected Candidates Tab */}
                {resultsTab === 'rejected' && (
                <div className="resume-tab-content">
                    <div className="resume-section-card">
                    <div className="resume-section-card-header resume-rejected-header">
                        <XCircle className="resume-section-icon" />
                        <h2 className="resume-section-card-title">Rejected Candidates</h2>
                        <p className="resume-section-card-subtitle">Detailed keyword analysis for candidates below threshold</p>
                    </div>
                    
                    <div className="resume-candidates-grid">
                        {rejectedCandidates.map((candidate, index) => (
                        <div key={index} className="resume-keyword-analysis-card resume-rejected-card">
                            <div className="resume-candidate-header">
                            <div className="resume-candidate-info">
                                <div className="resume-candidate-avatar resume-rejected-avatar">
                                <User className="resume-avatar-icon" />
                                </div>
                                <div className="resume-candidate-details">
                                <h3 className="resume-candidate-name">
                                    {candidate.result.name || candidate.filename}
                                </h3>
                                <p className="resume-candidate-filename">{candidate.filename}</p>
                                </div>
                            </div>
                            <div className="resume-score-badge resume-rejected-badge">
                                <AlertTriangle className="resume-badge-icon" />
                                <span className="resume-badge-text">{candidate.result.score}%</span>
                            </div>
                            </div>

                            <div className="resume-keyword-analysis">
                            <h4 className="resume-analysis-title">ATS Analysis</h4>
                            <p className="resume-analysis-text">{candidate.result.reason}</p>
                            
                            {/* Show missing keywords first for rejected candidates */}
                            {candidate.result.missing_keywords && candidate.result.missing_keywords.length > 0 && (
                                <div className="resume-keywords-section">
                                <p className="resume-keywords-label">❌ Missing Critical Keywords</p>
                                <div className="resume-keywords-list">
                                    {candidate.result.missing_keywords.map((keyword, i) => (
                                    <span key={i} className="resume-keyword-tag resume-missing">
                                        {keyword}
                                    </span>
                                    ))}
                                </div>
                                </div>
                            )}
                            
                            {/* Show matching keywords for rejected candidates (what they do have) */}
                            {candidate.result.keywords_matching && candidate.result.keywords_matching.length > 0 && (
                                <div className="resume-keywords-section">
                                <p className="resume-keywords-label">✅ Keywords Present</p>
                                <div className="resume-keywords-list">
                                    {candidate.result.keywords_matching.map((keyword, i) => (
                                    <span key={i} className="resume-keyword-tag resume-matching">
                                        {keyword}
                                    </span>
                                    ))}
                                </div>
                                </div>
                            )}
                            </div>
                        </div>
                        ))}
                        
                        {rejectedCandidates.length === 0 && (
                        <div className="resume-empty-state">
                            <XCircle className="resume-empty-icon" />
                            <p className="resume-empty-text">No rejected candidates found</p>
                            <p className="resume-empty-subtext">All candidates meet the minimum score threshold</p>
                        </div>
                        )}
                    </div>
                    </div>
                </div>
                )}
            </div>
            )}
        </div>
        </div>
        
    </Layout>
);
};

export default ResumeShortlister;