/**
 * Lighthouse Validator
 * Enforces 100% Google Lighthouse score compliance for Performance, Accessibility, Best Practices, and SEO
 * Validates Core Web Vitals (CLS, LCP, INP, FCP, TBT) against industry standards
 */

const lighthouseTargets = {
  // Core Web Vitals (CWV) Targets - Google industry standards
  vitals: {
    CLS: {
      name: 'Cumulative Layout Shift',
      threshold: 0.1,
      unit: 'unitless',
      priority: 'critical',
      description: 'Visual stability - no unexpected layout shifts'
    },
    LCP: {
      name: 'Largest Contentful Paint',
      threshold: 2500, // 2.5 seconds
      unit: 'milliseconds',
      priority: 'critical',
      description: 'Perceived load speed'
    },
    INP: {
      name: 'Interaction to Next Paint',
      threshold: 200, // 200 milliseconds
      unit: 'milliseconds',
      priority: 'critical',
      description: 'Responsiveness to user interactions'
    },
    FCP: {
      name: 'First Contentful Paint',
      threshold: 1500, // 1.5 seconds
      unit: 'milliseconds',
      priority: 'high',
      description: 'First paint of any content'
    },
    TBT: {
      name: 'Total Blocking Time',
      threshold: 200, // 200 milliseconds
      unit: 'milliseconds',
      priority: 'high',
      description: 'Total time main thread is blocked'
    }
  },

  // Lighthouse Score Targets (0-100)
  categories: {
    performance: {
      threshold: 100,
      priority: 'critical',
      description: 'Performance metrics and optimization'
    },
    accessibility: {
      threshold: 100,
      priority: 'critical',
      description: 'WCAG 2.1 AA compliance'
    },
    'best-practices': {
      threshold: 100,
      priority: 'high',
      description: 'Web platform best practices'
    },
    seo: {
      threshold: 100,
      priority: 'high',
      description: 'Search engine optimization'
    }
  },

  // Additional Performance Metrics
  metrics: {
    TTFB: {
      name: 'Time to First Byte',
      threshold: 600, // 600ms
      unit: 'milliseconds',
      priority: 'high',
      description: 'Server response time'
    },
    SI: {
      name: 'Speed Index',
      threshold: 3400, // 3.4 seconds
      unit: 'milliseconds',
      priority: 'high',
      description: 'Visual completeness over time'
    }
  }
};

/**
 * Parse Lighthouse JSON report
 * @param {object} lighthouseData - Parsed Lighthouse JSON report
 * @returns {object} Structured report with violations and recommendations
 */
function validateLighthouseReport(lighthouseData) {
  if (!lighthouseData || !lighthouseData.lighthouseVersion) {
    return {
      valid: false,
      error: 'Invalid Lighthouse report format'
    };
  }

  const report = {
    version: lighthouseData.lighthouseVersion,
    url: lighthouseData.finalUrl,
    timestamp: lighthouseData.fetchTime,
    scores: {},
    vitals: {},
    violations: [],
    recommendations: [],
    summary: {
      perfect: true,
      perfectScore: 100
    }
  };

  // Extract category scores
  if (lighthouseData.categories) {
    Object.entries(lighthouseData.categories).forEach(([key, category]) => {
      report.scores[key] = {
        name: category.title,
        score: Math.round(category.score * 100),
        target: lighthouseTargets.categories[key]?.threshold || 90
      };

      if (report.scores[key].score < (lighthouseTargets.categories[key]?.threshold || 90)) {
        report.summary.perfect = false;
        report.violations.push({
          category: key,
          score: report.scores[key].score,
          target: report.scores[key].target,
          gap: report.scores[key].target - report.scores[key].score
        });
      }
    });
  }

  // Extract Core Web Vitals from audits
  if (lighthouseData.audits) {
    // CLS
    if (lighthouseData.audits['cumulative-layout-shift']) {
      const cls = lighthouseData.audits['cumulative-layout-shift'].numericValue;
      report.vitals.CLS = {
        value: cls,
        threshold: lighthouseTargets.vitals.CLS.threshold,
        passed: cls <= lighthouseTargets.vitals.CLS.threshold
      };
      if (!report.vitals.CLS.passed) {
        report.violations.push({
          metric: 'CLS',
          value: cls,
          threshold: lighthouseTargets.vitals.CLS.threshold,
          gap: cls - lighthouseTargets.vitals.CLS.threshold
        });
      }
    }

    // LCP
    if (lighthouseData.audits['largest-contentful-paint']) {
      const lcp = lighthouseData.audits['largest-contentful-paint'].numericValue;
      report.vitals.LCP = {
        value: lcp,
        threshold: lighthouseTargets.vitals.LCP.threshold,
        passed: lcp <= lighthouseTargets.vitals.LCP.threshold
      };
      if (!report.vitals.LCP.passed) {
        report.violations.push({
          metric: 'LCP',
          value: lcp,
          threshold: lighthouseTargets.vitals.LCP.threshold,
          gap: lcp - lighthouseTargets.vitals.LCP.threshold
        });
      }
    }

    // INP
    if (lighthouseData.audits['interaction-to-next-paint']) {
      const inp = lighthouseData.audits['interaction-to-next-paint'].numericValue;
      report.vitals.INP = {
        value: inp,
        threshold: lighthouseTargets.vitals.INP.threshold,
        passed: inp <= lighthouseTargets.vitals.INP.threshold
      };
      if (!report.vitals.INP.passed) {
        report.violations.push({
          metric: 'INP',
          value: inp,
          threshold: lighthouseTargets.vitals.INP.threshold,
          gap: inp - lighthouseTargets.vitals.INP.threshold
        });
      }
    }

    // FCP
    if (lighthouseData.audits['first-contentful-paint']) {
      const fcp = lighthouseData.audits['first-contentful-paint'].numericValue;
      report.vitals.FCP = {
        value: fcp,
        threshold: lighthouseTargets.vitals.FCP.threshold,
        passed: fcp <= lighthouseTargets.vitals.FCP.threshold
      };
    }

    // Extract failing audits as recommendations
    const failedAudits = Object.entries(lighthouseData.audits)
      .filter(([_, audit]) => audit.score < 1 && audit.score !== null)
      .sort((a, b) => (b[1].weight || 0) - (a[1].weight || 0))
      .slice(0, 10); // Top 10 issues

    failedAudits.forEach(([id, audit]) => {
      report.recommendations.push({
        id,
        title: audit.title,
        description: audit.description,
        score: audit.score,
        weight: audit.weight || 0,
        details: audit.details?.items ? audit.details.items.slice(0, 3) : []
      });
    });
  }

  return report;
}

/**
 * Generate improvement plan from Lighthouse violations
 * @param {object} report - Validated Lighthouse report
 * @returns {object} Improvement plan with prioritized fixes
 */
function generateImprovementPlan(report) {
  const plan = {
    critical: [],
    high: [],
    medium: [],
    low: []
  };

  // Categorize by severity
  report.violations.forEach(violation => {
    if (violation.metric) {
      const vital = lighthouseTargets.vitals[violation.metric];
      if (vital?.priority === 'critical') {
        plan.critical.push({
          type: 'metric',
          metric: violation.metric,
          current: violation.value,
          target: violation.threshold,
          gap: violation.gap,
          fix: `Improve ${vital.name} to ≤ ${violation.threshold}ms`
        });
      }
    } else if (violation.category) {
      const category = lighthouseTargets.categories[violation.category];
      if (category?.priority === 'critical') {
        plan.critical.push({
          type: 'category',
          category: violation.category,
          current: violation.score,
          target: violation.target,
          gap: violation.gap,
          fix: `Increase ${violation.category} score to 100`
        });
      }
    }
  });

  // Add audit recommendations
  report.recommendations.slice(0, 5).forEach(rec => {
    plan.high.push({
      type: 'audit',
      title: rec.title,
      description: rec.description,
      score: rec.score,
      details: rec.details
    });
  });

  return plan;
}

/**
 * Validate performance metrics for CI/CD enforcement
 * @param {object} metrics - Performance metrics object
 * @param {string} environment - 'mobile' or 'desktop'
 * @returns {object} Validation results
 */
function validatePerformanceMetrics(metrics, environment = 'mobile') {
  const results = {
    passed: true,
    failures: [],
    warnings: []
  };

  // Mobile targets are stricter
  const multiplier = environment === 'mobile' ? 1 : 0.9;

  Object.entries(lighthouseTargets.vitals).forEach(([key, vital]) => {
    const threshold = vital.threshold * multiplier;
    const value = metrics[key];

    if (value !== undefined) {
      if (value > threshold) {
        if (vital.priority === 'critical') {
          results.passed = false;
          results.failures.push({
            metric: key,
            value,
            threshold,
            priority: vital.priority
          });
        } else {
          results.warnings.push({
            metric: key,
            value,
            threshold,
            priority: vital.priority
          });
        }
      }
    }
  });

  return results;
}

module.exports = {
  lighthouseTargets,
  validateLighthouseReport,
  generateImprovementPlan,
  validatePerformanceMetrics
};
