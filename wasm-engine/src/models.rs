use rand::Rng;
use rand_distr::{StudentT, Normal, StandardNormal, Distribution};
use std::collections::HashMap;
use rand::seq::SliceRandom;

pub struct FilterParams {
    pub starting_capital: f64,
    pub n_trades: usize,
    pub data_format: String,
    pub commission_per_trade: f64,
    pub position_size_multiplier: f64,
    pub slippage_model: String,
    pub impact_coefficient: f64,
    pub base_volatility: f64,
    
    pub daily_loss_limit_enabled: bool,
    pub trades_per_session: usize,
    pub daily_max_losses: usize,
    pub daily_max_loss_dollars: f64,
}

pub fn random_student_t<R: Rng>(df: f64, rng: &mut R) -> f64 {
    let dist = StudentT::new(df).unwrap();
    dist.sample(rng)
}

pub fn random_normal<R: Rng>(mu: f64, sigma: f64, rng: &mut R) -> f64 {
    let dist = Normal::new(mu, sigma).unwrap();
    dist.sample(rng)
}

pub fn compute_slippage(filter: &FilterParams, ret: f64) -> f64 {
    if filter.slippage_model == "fixed" {
        return filter.commission_per_trade * filter.position_size_multiplier;
    }
    
    let mut vol_factor = 1.0;
    if filter.base_volatility > 0.0 {
        vol_factor = 1.0 + (ret.abs() / filter.base_volatility) * filter.impact_coefficient;
    }
    filter.commission_per_trade * filter.position_size_multiplier * vol_factor
}

pub fn simulate_parametric_path<R: Rng>(
    mu: f64,
    sigma: f64,
    df: Option<f64>,
    filter: &FilterParams,
    rng: &mut R,
) -> Vec<f64> {
    let mut path = Vec::with_capacity(filter.n_trades + 1);
    path.push(filter.starting_capital);

    let use_student = df.is_some() && df.unwrap() < 30.0;
    let actual_df = df.unwrap_or(30.0);

    let mut session_loss_count = 0;
    let mut session_dollar_loss = 0.0;

    for t in 0..filter.n_trades {
        if filter.daily_loss_limit_enabled && t % filter.trades_per_session.max(1) == 0 {
            session_loss_count = 0;
            session_dollar_loss = 0.0;
        }

        if filter.daily_loss_limit_enabled && (session_loss_count >= filter.daily_max_losses || session_dollar_loss <= -filter.daily_max_loss_dollars) {
            let last = *path.last().unwrap();
            path.push(last);
            continue;
        }

        let t_val = if use_student {
            random_student_t(actual_df, rng)
        } else {
            random_student_t(30.0, rng)
        };

        let simulated_draw = mu + t_val * sigma;
        let last_balance = *path.last().unwrap();
        
        let new_balance = if filter.data_format == "absolute" {
            let slip = compute_slippage(filter, simulated_draw);
            last_balance + simulated_draw - slip
        } else {
            let slip = 0.0;
            let ret = 1.0 + simulated_draw;
            (last_balance * ret).max(0.0)
        };

        path.push(new_balance);

        if filter.daily_loss_limit_enabled {
            let trade_pnl = new_balance - last_balance;
            if trade_pnl < 0.0 {
                session_loss_count += 1;
            }
            session_dollar_loss += trade_pnl;
        }
    }
    path
}

pub fn simulate_garch_path<R: Rng>(
    omega: f64,
    alpha: f64,
    beta: f64,
    mu: f64,
    innov_df: Option<f64>,
    filter: &FilterParams,
    rng: &mut R,
) -> Vec<f64> {
    let mut pnl = Vec::with_capacity(filter.n_trades);
    let mut variance = omega / (1.0 - alpha - beta);
    
    let use_student = innov_df.is_some() && innov_df.unwrap() < 30.0;
    let actual_df = innov_df.unwrap_or(30.0);
    
    for _ in 0..filter.n_trades {
        let z = if use_student {
            let raw_t = random_student_t(actual_df, rng);
            let var_t = actual_df / (actual_df - 2.0);
            raw_t / var_t.sqrt()
        } else {
            StandardNormal.sample(rng)
        };
        
        let r = variance.sqrt() * z;
        pnl.push(mu + r);
        variance = omega + alpha * (r * r) + beta * variance;
    }
    
    let mut path = Vec::with_capacity(filter.n_trades + 1);
    path.push(filter.starting_capital);

    let mut session_loss_count = 0;
    let mut session_dollar_loss = 0.0;

    for t in 0..filter.n_trades {
        if filter.daily_loss_limit_enabled && t % filter.trades_per_session.max(1) == 0 {
            session_loss_count = 0;
            session_dollar_loss = 0.0;
        }

        if filter.daily_loss_limit_enabled && (session_loss_count >= filter.daily_max_losses || session_dollar_loss <= -filter.daily_max_loss_dollars) {
            let last = *path.last().unwrap();
            path.push(last);
            continue;
        }

        let ret = pnl[t];
        let last_balance = *path.last().unwrap();
        
        let new_balance = if filter.data_format == "absolute" {
            let slip = compute_slippage(filter, ret);
            last_balance + ret - slip
        } else {
            (last_balance * (1.0 + ret)).max(0.0)
        };
        
        path.push(new_balance);

        if filter.daily_loss_limit_enabled {
            let trade_pnl = new_balance - last_balance;
            if trade_pnl < 0.0 {
                session_loss_count += 1;
            }
            session_dollar_loss += trade_pnl;
        }
    }
    
    path
}

fn geometric_random<R: Rng>(p: f64, rng: &mut R) -> usize {
    if p >= 1.0 {
        return 1;
    }
    let u: f64 = rng.gen();
    (u.max(1e-15).ln() / (1.0 - p).ln()).ceil() as usize
}

pub fn simulate_bootstrap_path<R: Rng>(
    original_pnls: &[f64],
    sampling_mode: &str,
    avg_block_length: f64,
    filter: &FilterParams,
    rng: &mut R,
) -> Vec<f64> {
    let mut trade_sequence = Vec::with_capacity(filter.n_trades);
    let len = original_pnls.len();

    if sampling_mode == "permutation" {
        let mut indices: Vec<usize> = (0..len).collect();
        indices.shuffle(rng);
        for &i in &indices {
            trade_sequence.push(original_pnls[i]);
        }
    } else if sampling_mode == "block_bootstrap" {
        let p = 1.0 / avg_block_length.max(1.0);
        while trade_sequence.len() < filter.n_trades {
            let block_len = geometric_random(p, rng);
            let start = rng.gen_range(0..len);
            let remaining = filter.n_trades - trade_sequence.len();
            let to_copy = block_len.min(remaining);
            for j in 0..to_copy {
                trade_sequence.push(original_pnls[(start + j) % len]);
            }
        }
    } else {
        // Simple bootstrap (iid)
    }

    let mut path = Vec::with_capacity(filter.n_trades + 1);
    path.push(filter.starting_capital);
    
    let mut session_loss_count = 0;
    let mut session_dollar_loss = 0.0;

    for t in 0..filter.n_trades {
        if filter.daily_loss_limit_enabled && t % filter.trades_per_session.max(1) == 0 {
            session_loss_count = 0;
            session_dollar_loss = 0.0;
        }

        if filter.daily_loss_limit_enabled && (session_loss_count >= filter.daily_max_losses || session_dollar_loss <= -filter.daily_max_loss_dollars) {
            let last = *path.last().unwrap();
            path.push(last);
            continue;
        }

        let ret = if sampling_mode == "permutation" || sampling_mode == "block_bootstrap" {
            trade_sequence[t % trade_sequence.len()]
        } else {
            let idx = rng.gen_range(0..len);
            original_pnls[idx]
        };

        let last_balance = *path.last().unwrap();
        
        let new_balance = if filter.data_format == "absolute" {
            let slip = compute_slippage(filter, ret);
            last_balance + ret - slip
        } else {
            (last_balance * ret).max(0.0)
        };
        path.push(new_balance);

        if filter.daily_loss_limit_enabled {
            let trade_pnl = new_balance - last_balance;
            if trade_pnl < 0.0 {
                session_loss_count += 1;
            }
            session_dollar_loss += trade_pnl;
        }
    }
    path
}

pub fn simulate_regime_path<R: Rng>(
    original_pnls: &[f64],
    regime_tags: &[String],
    filter: &FilterParams,
    rng: &mut R,
) -> Vec<f64> {
    let mut unique_regimes = Vec::new();
    let mut regime_pnls: HashMap<String, Vec<f64>> = HashMap::new();
    let mut transition_counts: HashMap<String, HashMap<String, usize>> = HashMap::new();
    
    for (i, tag) in regime_tags.iter().enumerate() {
        if !unique_regimes.contains(tag) {
            unique_regimes.push(tag.clone());
            regime_pnls.insert(tag.clone(), Vec::new());
            transition_counts.insert(tag.clone(), HashMap::new());
        }
        regime_pnls.get_mut(tag).unwrap().push(original_pnls[i]);
        if i < regime_tags.len() - 1 {
            let next_tag = &regime_tags[i + 1];
            *transition_counts.get_mut(tag).unwrap().entry(next_tag.clone()).or_insert(0) += 1;
        }
    }
    
    for r in &unique_regimes {
        for r2 in &unique_regimes {
            transition_counts.get_mut(r).unwrap().entry(r2.clone()).or_insert(0);
        }
    }
    
    let mut transition_probs: HashMap<String, Vec<(String, f64)>> = HashMap::new();
    for r in &unique_regimes {
        let total: usize = transition_counts[r].values().sum();
        let mut cumulative = 0.0;
        let mut probs = Vec::new();
        for r2 in &unique_regimes {
            let p = if total > 0 {
                *transition_counts[r].get(r2).unwrap() as f64 / total as f64
            } else {
                1.0 / unique_regimes.len() as f64
            };
            cumulative += p;
            probs.push((r2.clone(), cumulative));
        }
        transition_probs.insert(r.clone(), probs);
    }
    
    let mut path = Vec::with_capacity(filter.n_trades + 1);
    path.push(filter.starting_capital);
    
    let mut session_loss_count = 0;
    let mut session_dollar_loss = 0.0;
    
    let start_idx = rng.gen_range(0..unique_regimes.len());
    let mut current_regime = unique_regimes[start_idx].clone();
    
    for t in 0..filter.n_trades {
        if filter.daily_loss_limit_enabled && t % filter.trades_per_session.max(1) == 0 {
            session_loss_count = 0;
            session_dollar_loss = 0.0;
        }

        if filter.daily_loss_limit_enabled && (session_loss_count >= filter.daily_max_losses || session_dollar_loss <= -filter.daily_max_loss_dollars) {
            let last = *path.last().unwrap();
            path.push(last);
            continue;
        }

        let pnls = regime_pnls.get(&current_regime).unwrap();
        let ret = if pnls.is_empty() {
            if filter.data_format == "absolute" { 0.0 } else { 1.0 }
        } else {
            pnls[rng.gen_range(0..pnls.len())]
        };
        
        let last_balance = *path.last().unwrap();
        let new_balance = if filter.data_format == "absolute" {
            let slip = compute_slippage(filter, ret);
            last_balance + ret - slip
        } else {
            (last_balance * ret).max(0.0)
        };
        path.push(new_balance);

        if filter.daily_loss_limit_enabled {
            let trade_pnl = new_balance - last_balance;
            if trade_pnl < 0.0 {
                session_loss_count += 1;
            }
            session_dollar_loss += trade_pnl;
        }
        
        let rand_val: f64 = rng.gen();
        for (next_r, cumulative_prob) in transition_probs.get(&current_regime).unwrap() {
            if rand_val <= *cumulative_prob {
                current_regime = next_r.clone();
                break;
            }
        }
    }
    
    path
}
