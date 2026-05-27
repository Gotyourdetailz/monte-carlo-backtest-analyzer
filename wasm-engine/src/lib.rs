use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use rand::{Rng, SeedableRng};
use rand::rngs::StdRng;

mod math;
mod distribution;
mod metrics;
mod models;

use distribution::{fit_best_distribution, FittedDistribution, FitResult};
use metrics::{compute_institutional_metrics, InstitutionalRiskMetrics};
use models::{simulate_parametric_path, simulate_garch_path, simulate_bootstrap_path, compute_slippage, FilterParams};

#[derive(Deserialize)]
pub struct WasmSimulationParams {
    pub n_simulations: usize,
    pub n_trades: usize,
    pub starting_capital: f64,
    pub original_pnls: Vec<f64>,
    pub data_format: String,
    pub commission_per_trade: f64,
    pub model_type: String, // "basic", "parametric", "garch"
    pub sampling_mode: String,
    pub avg_block_length: Option<f64>,
    pub periods_per_year: f64,
    pub random_seed: Option<u64>,
    pub ruin_threshold: f64,
    
    // Slippage
    pub position_size_multiplier: Option<f64>,
    pub slippage_model: Option<String>,
    pub impact_coefficient: Option<f64>,
    pub base_volatility: Option<f64>,

    // Daily Loss Limit
    pub daily_loss_limit_enabled: Option<bool>,
    pub trades_per_session: Option<usize>,
    pub daily_max_losses: Option<usize>,
    pub daily_max_loss_dollars: Option<f64>,

    // Prop Firm Rules
    pub prop_firm_rules_enabled: Option<bool>,
    pub prop_target: Option<f64>,
    pub prop_max_drawdown: Option<f64>,
    pub prop_consistency_percent: Option<f64>,

    // For GARCH specifically
    pub garch_omega: Option<f64>,
    pub garch_alpha: Option<f64>,
    pub garch_beta: Option<f64>,
    pub garch_mu: Option<f64>,
    
    // For Regime Switching
    pub regime_tags: Option<Vec<String>>,
}

#[derive(Serialize)]
pub struct WasmSimulationResults {
    pub mean_final_balance: f64,
    pub p5_balance: f64,
    pub p95_balance: f64,
    pub final_balances: Vec<f64>,
    pub max_drawdowns: Vec<f64>,
    pub mean_ev: f64,
    pub ruin_probability: f64,
    
    pub passed_count: usize,
    pub fail_drawdown_count: usize,
    pub fail_consistency_count: usize,
    pub fail_time_count: usize,

    pub institutional_metrics: InstitutionalRiskMetrics,
    pub distribution_fit: Option<FittedDistribution>,
    pub stored_paths: Vec<Vec<f64>>,
}

#[wasm_bindgen]
pub fn run_mc_simulation(params_json: &str) -> String {
    let params: WasmSimulationParams = serde_json::from_str(params_json).unwrap();
    let mut rng = match params.random_seed {
        Some(seed) => StdRng::seed_from_u64(seed),
        None => StdRng::from_entropy(),
    };

    let filter_params = FilterParams {
        starting_capital: params.starting_capital,
        n_trades: params.n_trades,
        data_format: params.data_format.clone(),
        commission_per_trade: params.commission_per_trade,
        position_size_multiplier: params.position_size_multiplier.unwrap_or(1.0),
        slippage_model: params.slippage_model.clone().unwrap_or_else(|| "fixed".to_string()),
        impact_coefficient: params.impact_coefficient.unwrap_or(0.1),
        base_volatility: params.base_volatility.unwrap_or(0.0),
        
        daily_loss_limit_enabled: params.daily_loss_limit_enabled.unwrap_or(false),
        trades_per_session: params.trades_per_session.unwrap_or(1),
        daily_max_losses: params.daily_max_losses.unwrap_or(0),
        daily_max_loss_dollars: params.daily_max_loss_dollars.unwrap_or(0.0),
    };

    let mut final_balances = Vec::with_capacity(params.n_simulations);
    let mut max_drawdowns = Vec::with_capacity(params.n_simulations);
    let mut ev_sum = 0.0;
    let mut ruin_count = 0;
    let ruin_val = params.starting_capital * (1.0 - (params.ruin_threshold / 100.0));
    
    let mut passed_count = 0;
    let mut fail_drawdown_count = 0;
    let mut fail_consistency_count = 0;
    let mut fail_time_count = 0;

    let prop_firm_enabled = params.prop_firm_rules_enabled.unwrap_or(false);
    let prop_target = params.prop_target.unwrap_or(0.0);
    let prop_max_drawdown = params.prop_max_drawdown.unwrap_or(0.0);
    let prop_consistency_percent = params.prop_consistency_percent.unwrap_or(0.0);

    let mut distribution_fit = None;
    let mut stored_paths: Vec<Vec<f64>> = Vec::new();
    let max_stored_paths = 50usize;

    if params.model_type == "parametric" {
        let fit_input: Vec<f64> = if params.data_format == "absolute" {
            params.original_pnls.iter().map(|&p| p - params.commission_per_trade).collect()
        } else {
            params.original_pnls.iter().map(|&x| x - 1.0).collect()
        };
        let fit_result = fit_best_distribution(&fit_input);
        let dist = fit_result.best.clone();
        distribution_fit = Some(dist.clone());

        for i in 0..params.n_simulations {
            let path = simulate_parametric_path(
                dist.mu,
                dist.sigma,
                dist.df,
                &filter_params,
                &mut rng,
            );
            if i < max_stored_paths {
                stored_paths.push(path.clone());
            }
            process_path(&path, params.starting_capital, params.n_trades, &params.data_format, ruin_val, &mut final_balances, &mut max_drawdowns, &mut ev_sum, &mut ruin_count);
            
            if prop_firm_enabled {
                process_prop_firm(&path, params.starting_capital, prop_target, prop_max_drawdown, prop_consistency_percent, &mut passed_count, &mut fail_drawdown_count, &mut fail_consistency_count, &mut fail_time_count);
            }
        }
    } else if params.model_type == "garch" {
        let omega = params.garch_omega.unwrap_or(0.0001);
        let alpha = params.garch_alpha.unwrap_or(0.1);
        let beta = params.garch_beta.unwrap_or(0.85);
        let mu = params.garch_mu.unwrap_or(0.0);

        let fit_input: Vec<f64> = if params.data_format == "absolute" {
            params.original_pnls.iter().map(|&p| p - params.commission_per_trade).collect()
        } else {
            params.original_pnls.iter().map(|&x| x - 1.0).collect()
        };
        let fit_result = fit_best_distribution(&fit_input);
        let dist = fit_result.best.clone();
        distribution_fit = Some(dist.clone());

        for i in 0..params.n_simulations {
            let path = simulate_garch_path(omega, alpha, beta, mu, dist.df, &filter_params, &mut rng);
            if i < max_stored_paths {
                stored_paths.push(path.clone());
            }
            process_path(&path, params.starting_capital, params.n_trades, &params.data_format, ruin_val, &mut final_balances, &mut max_drawdowns, &mut ev_sum, &mut ruin_count);

            if prop_firm_enabled {
                process_prop_firm(&path, params.starting_capital, prop_target, prop_max_drawdown, prop_consistency_percent, &mut passed_count, &mut fail_drawdown_count, &mut fail_consistency_count, &mut fail_time_count);
            }
        }
    } else if params.model_type == "regime" && params.regime_tags.is_some() {
        let tags = params.regime_tags.clone().unwrap();
        for i in 0..params.n_simulations {
            let path = models::simulate_regime_path(&params.original_pnls, &tags, &filter_params, &mut rng);
            if i < max_stored_paths {
                stored_paths.push(path.clone());
            }
            process_path(&path, params.starting_capital, params.n_trades, &params.data_format, ruin_val, &mut final_balances, &mut max_drawdowns, &mut ev_sum, &mut ruin_count);

            if prop_firm_enabled {
                process_prop_firm(&path, params.starting_capital, prop_target, prop_max_drawdown, prop_consistency_percent, &mut passed_count, &mut fail_drawdown_count, &mut fail_consistency_count, &mut fail_time_count);
            }
        }
    } else {
        // "basic" (bootstrap)
        let avg_block = params.avg_block_length.unwrap_or(1.0);
        for i in 0..params.n_simulations {
            let path = simulate_bootstrap_path(
                &params.original_pnls,
                &params.sampling_mode,
                avg_block,
                &filter_params,
                &mut rng,
            );
            if i < max_stored_paths {
                stored_paths.push(path.clone());
            }
            process_path(&path, params.starting_capital, params.n_trades, &params.data_format, ruin_val, &mut final_balances, &mut max_drawdowns, &mut ev_sum, &mut ruin_count);

            if prop_firm_enabled {
                process_prop_firm(&path, params.starting_capital, prop_target, prop_max_drawdown, prop_consistency_percent, &mut passed_count, &mut fail_drawdown_count, &mut fail_consistency_count, &mut fail_time_count);
            }
        }
    }

    let mean_ev = ev_sum / params.n_simulations as f64;
    let mean_final_balance = final_balances.iter().sum::<f64>() / params.n_simulations as f64;
    let ruin_probability = (ruin_count as f64 / params.n_simulations as f64) * 100.0;

    let mut sorted_balances = final_balances.clone();
    sorted_balances.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let p5_balance = sorted_balances[(params.n_simulations as f64 * 0.05) as usize];
    let p95_balance = sorted_balances[(params.n_simulations as f64 * 0.95) as usize];

    let institutional_metrics = compute_institutional_metrics(
        &final_balances,
        &max_drawdowns,
        params.starting_capital,
        params.n_trades,
        params.periods_per_year,
    );

    let result = WasmSimulationResults {
        mean_final_balance,
        p5_balance,
        p95_balance,
        final_balances,
        max_drawdowns,
        mean_ev,
        ruin_probability,
        passed_count,
        fail_drawdown_count,
        fail_consistency_count,
        fail_time_count,
        institutional_metrics,
        distribution_fit,
        stored_paths,
    };

    serde_json::to_string(&result).unwrap()
}

fn process_path(
    path: &[f64],
    starting_capital: f64,
    n_trades: usize,
    data_format: &str,
    ruin_val: f64,
    final_balances: &mut Vec<f64>,
    max_drawdowns: &mut Vec<f64>,
    ev_sum: &mut f64,
    ruin_count: &mut usize,
) {
    let final_balance = *path.last().unwrap();
    final_balances.push(final_balance);

    let mut peak = f64::NEG_INFINITY;
    let mut max_dd = 0.0;
    let mut is_ruin = false;
    for &val in path {
        if val <= ruin_val {
            is_ruin = true;
        }
        if val > peak {
            peak = val;
        }
        let mut dd = (peak - val) / peak.max(1e-8);
        if dd > 1.0 {
            dd = 1.0;
        }
        if dd > max_dd {
            max_dd = dd;
        }
    }
    max_drawdowns.push(max_dd);
    if is_ruin {
        *ruin_count += 1;
    }

    let path_return = if data_format == "absolute" {
        (final_balance - starting_capital) / n_trades.max(1) as f64
    } else {
        if final_balance > 0.0 {
            (final_balance / starting_capital).powf(1.0 / n_trades.max(1) as f64) - 1.0
        } else {
            -1.0
        }
    };
    *ev_sum += path_return;
}

fn process_prop_firm(
    path: &[f64],
    starting_capital: f64,
    prop_target: f64,
    prop_max_drawdown: f64,
    prop_consistency_percent: f64,
    passed_count: &mut usize,
    fail_drawdown_count: &mut usize,
    fail_consistency_count: &mut usize,
    fail_time_count: &mut usize,
) {
    let mut is_done = false;
    let mut peak_bal = starting_capital;
    let mut trade_profits = Vec::with_capacity(path.len());

    for t in 1..path.len() {
        let bal = path[t];
        let prev_bal = path[t - 1];
        let trade_profit = bal - prev_bal;
        trade_profits.push(trade_profit);

        if bal > peak_bal {
            peak_bal = bal;
        }

        let trailing_drawdown = peak_bal - bal;
        if trailing_drawdown >= prop_max_drawdown {
            *fail_drawdown_count += 1;
            is_done = true;
            break;
        }

        let total_profit = bal - starting_capital;
        if total_profit >= prop_target {
            let consistency_threshold = total_profit * (prop_consistency_percent / 100.0);
            let mut failed_consistency = false;
            for &tp in &trade_profits {
                if tp > consistency_threshold {
                    failed_consistency = true;
                    break;
                }
            }
            if failed_consistency {
                *fail_consistency_count += 1;
            } else {
                *passed_count += 1;
            }
            is_done = true;
            break;
        }
    }

    if !is_done {
        *fail_time_count += 1;
    }
}
