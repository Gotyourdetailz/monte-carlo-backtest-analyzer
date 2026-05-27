use serde::{Deserialize, Serialize};
use std::f64::consts::PI;
use crate::math::log_gamma;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FittedDistribution {
    pub r#type: String, // "normal" or "student_t"
    pub mu: f64,
    pub sigma: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub df: Option<f64>,
    #[serde(rename = "logLikelihood")]
    pub log_likelihood: f64,
    pub aic: f64,
    pub bic: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FitResult {
    pub best: FittedDistribution,
    pub all: Vec<FittedDistribution>,
}

fn normal_log_pdf(x: f64, mu: f64, sigma: f64) -> f64 {
    let z = (x - mu) / sigma;
    -0.5 * (2.0 * PI).ln() - sigma.ln() - 0.5 * z * z
}

fn student_t_log_pdf(x: f64, mu: f64, sigma: f64, df: f64) -> f64 {
    let z = (x - mu) / sigma;
    log_gamma((df + 1.0) / 2.0)
        - log_gamma(df / 2.0)
        - 0.5 * (df * PI * sigma * sigma).ln()
        - ((df + 1.0) / 2.0) * (1.0 + (z * z) / df).ln()
}

fn total_log_likelihood<F>(data: &[f64], log_pdf_fn: F) -> f64
where
    F: Fn(f64) -> f64,
{
    let mut ll = 0.0;
    for &x in data {
        let term = log_pdf_fn(x);
        if !term.is_finite() {
            return f64::NEG_INFINITY;
        }
        ll += term;
    }
    ll
}

pub fn fit_normal(data: &[f64]) -> FittedDistribution {
    let n = data.len() as f64;
    if data.len() < 2 {
        panic!("fit_normal: need at least 2 data points");
    }

    let mu = data.iter().sum::<f64>() / n;
    
    let mut ssq = 0.0;
    for &x in data {
        let d = x - mu;
        ssq += d * d;
    }
    let sigma = (ssq / n).sqrt();
    let safe_sigma = if sigma > 0.0 { sigma } else { 1e-10 };

    let ll = total_log_likelihood(data, |x| normal_log_pdf(x, mu, safe_sigma));
    let k = 2.0;
    
    FittedDistribution {
        r#type: "normal".to_string(),
        mu,
        sigma: safe_sigma,
        df: None,
        log_likelihood: ll,
        aic: -2.0 * ll + 2.0 * k,
        bic: -2.0 * ll + k * n.ln(),
    }
}

pub fn fit_student_t(data: &[f64]) -> FittedDistribution {
    let n = data.len() as f64;
    if data.len() < 3 {
        panic!("fit_student_t: need at least 3 data points");
    }

    let mu = data.iter().sum::<f64>() / n;
    
    let mut ssq = 0.0;
    for &x in data {
        let d = x - mu;
        ssq += d * d;
    }
    let sample_var = ssq / n;
    let sample_std = sample_var.sqrt();
    let safe_sample_std = if sample_std > 0.0 { sample_std } else { 1e-10 };

    let mut best_df = 3.0;
    let mut best_sigma = safe_sample_std;
    let mut best_ll = f64::NEG_INFINITY;

    let mut df = 1.0;
    while df <= 30.0 {
        let mut sigma = if df > 2.0 {
            safe_sample_std * f64::sqrt((df - 2.0) / df)
        } else {
            safe_sample_std
        };
        if sigma <= 0.0 {
            sigma = 1e-10;
        }

        let ll = total_log_likelihood(data, |x| student_t_log_pdf(x, mu, sigma, df));

        if ll > best_ll {
            best_ll = ll;
            best_df = df;
            best_sigma = sigma;
        }
        df += 0.5;
    }

    let k = 3.0;
    FittedDistribution {
        r#type: "student_t".to_string(),
        mu,
        sigma: best_sigma,
        df: Some(best_df),
        log_likelihood: best_ll,
        aic: -2.0 * best_ll + 2.0 * k,
        bic: -2.0 * best_ll + k * n.ln(),
    }
}

pub fn fit_best_distribution(data: &[f64]) -> FitResult {
    let normal_fit = fit_normal(data);
    let student_t_fit = fit_student_t(data);

    let all = vec![normal_fit.clone(), student_t_fit.clone()];
    let best = if normal_fit.bic <= student_t_fit.bic {
        normal_fit
    } else {
        student_t_fit
    };

    FitResult { best, all }
}
