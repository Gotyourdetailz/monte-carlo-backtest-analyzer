use std::f64::consts::PI;

const LANCZOS_G: f64 = 7.0;
const LANCZOS_COEFFICIENTS: [f64; 9] = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
];

/// Natural logarithm of the Gamma function, ln(Γ(x)), using the
/// Lanczos approximation with reflection formula for x < 0.5.
pub fn log_gamma(x: f64) -> f64 {
    if x <= 0.0 && x.fract() == 0.0 {
        panic!("log_gamma: pole at non-positive integer x = {}", x);
    }

    if x < 0.5 {
        return PI.ln() - (PI * x).sin().abs().ln() - log_gamma(1.0 - x);
    }

    let z = x - 1.0;
    let mut ag = LANCZOS_COEFFICIENTS[0];
    for i in 1..LANCZOS_COEFFICIENTS.len() {
        ag += LANCZOS_COEFFICIENTS[i] / (z + i as f64);
    }

    let t = z + LANCZOS_G + 0.5;
    0.5 * (2.0 * PI).ln() + (z + 0.5) * t.ln() - t + ag.ln()
}
