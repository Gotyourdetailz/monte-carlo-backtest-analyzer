use serde::{Deserialize, Serialize};

pub fn percentile(sorted_asc: &[f64], p: f64) -> f64 {
    if sorted_asc.is_empty() {
        return 0.0;
    }
    let idx = (sorted_asc.len() as f64 * p).floor() as usize;
    let clamped_idx = idx.clamp(0, sorted_asc.len() - 1);
    sorted_asc[clamped_idx]
}

pub fn value_at_risk(sorted_asc: &[f64], confidence: f64) -> f64 {
    percentile(sorted_asc, 1.0 - confidence)
}

pub fn expected_shortfall(sorted_asc: &[f64], confidence: f64) -> f64 {
    if sorted_asc.is_empty() {
        return 0.0;
    }
    let cutoff = ((sorted_asc.len() as f64 * (1.0 - confidence)).floor() as usize).max(1);
    let tail = &sorted_asc[..cutoff];
    let sum: f64 = tail.iter().sum();
    sum / tail.len() as f64
}

pub fn skewness(data: &[f64]) -> f64 {
    let n = data.len() as f64;
    if n < 3.0 {
        return 0.0;
    }
    let mean = data.iter().sum::<f64>() / n;
    let m2 = data.iter().map(|&v| (v - mean).powi(2)).sum::<f64>() / n;
    let m3 = data.iter().map(|&v| (v - mean).powi(3)).sum::<f64>() / n;
    if m2 == 0.0 {
        return 0.0;
    }
    m3 / m2.powf(1.5)
}

pub fn excess_kurtosis(data: &[f64]) -> f64 {
    let n = data.len() as f64;
    if n < 4.0 {
        return 0.0;
    }
    let mean = data.iter().sum::<f64>() / n;
    let m2 = data.iter().map(|&v| (v - mean).powi(2)).sum::<f64>() / n;
    let m4 = data.iter().map(|&v| (v - mean).powi(4)).sum::<f64>() / n;
    if m2 == 0.0 {
        return 0.0;
    }
    m4 / m2.powi(2) - 3.0
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct InstitutionalRiskMetrics {
    pub var95: f64,
    pub var99: f64,
    pub cvar95: f64,
    pub cvar99: f64,
    #[serde(rename = "medianFinalBalance")]
    pub median_final_balance: f64,
    #[serde(rename = "medianMaxDrawdown")]
    pub median_max_drawdown: f64,
    pub skewness: f64,
    #[serde(rename = "excessKurtosis")]
    pub excess_kurtosis: f64,
    #[serde(rename = "probabilityOfLoss")]
    pub probability_of_loss: f64,
    #[serde(rename = "calmarRatio")]
    pub calmar_ratio: f64,
}

pub fn compute_institutional_metrics(
    final_balances: &[f64],
    max_drawdowns: &[f64],
    starting_capital: f64,
    n_trades: usize,
    periods_per_year: f64,
) -> InstitutionalRiskMetrics {
    let mut sorted_balances = final_balances.to_vec();
    sorted_balances.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let mut sorted_dd = max_drawdowns.to_vec();
    sorted_dd.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let pnl: Vec<f64> = final_balances.iter().map(|&b| b - starting_capital).collect();
    let mut sorted_pnl = pnl.clone();
    sorted_pnl.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let median_final_balance = percentile(&sorted_balances, 0.5);
    let median_max_drawdown = percentile(&sorted_dd, 0.5);
    
    let loss_count = pnl.iter().filter(|&&p| p < 0.0).count();
    let probability_of_loss = (loss_count as f64 / pnl.len().max(1) as f64) * 100.0;

    let years = (n_trades as f64 / periods_per_year).max(1.0 / periods_per_year);
    let median_return = (median_final_balance - starting_capital) / starting_capital;
    let annualized_return = (1.0 + median_return).powf(1.0 / years) - 1.0;
    
    let calmar_ratio = if median_max_drawdown > 0.0 {
        annualized_return / median_max_drawdown
    } else {
        0.0
    };

    InstitutionalRiskMetrics {
        var95: value_at_risk(&sorted_pnl, 0.95),
        var99: value_at_risk(&sorted_pnl, 0.99),
        cvar95: expected_shortfall(&sorted_pnl, 0.95),
        cvar99: expected_shortfall(&sorted_pnl, 0.99),
        median_final_balance,
        median_max_drawdown,
        skewness: skewness(&pnl),
        excess_kurtosis: self::excess_kurtosis(&pnl),
        probability_of_loss,
        calmar_ratio,
    }
}
