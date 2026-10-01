---
icon: rt/q
---

# :rt-q: The safety factor q

!!! abstract "The question"

    The reward pays for q_min and q95. What is q, why is "q below 1" bad, and how does the agent change it?

## Field lines that twist

Follow one magnetic field line. On each flux surface it goes round the long way (toroidally) and the short way (poloidally) at the same time. The **safety factor** q is the number of toroidal turns per poloidal turn. In a large-aspect-ratio circular approximation,

$$
q(r) \approx \frac{r\,B_\varphi}{R\,B_\theta(r)} = \frac{2\pi r^2 B_\varphi}{\mu_0 R\, I(r)},
$$

where I(r) is the current enclosed within radius r. More current inside r means a stronger poloidal field there and a lower q. A real, elongated plasma carries a geometric factor in front (about (1 + κ²)/2; the Lab uses a calibrated G(ρ̂), see <span class="rt-eqref" data-eq="q"></span>).

<div class="rt-widget" data-widget="q" data-title="Interactive: what the safety factor q measures"></div>

At rational q = m/n a field line closes on itself after m toroidal turns: the surface is **resonant**, and small perturbations with the same helicity can grow there. That is where the trouble lives: **sawteeth** at q = 1, **tearing modes** at q = 3/2 and 2.

## Two numbers summarise the profile

- **q95**, q at the surface enclosing 95 % of the poloidal flux, is set mostly by total I_p and the shape. Low q95 risks disruptions (the usual rule of thumb is to stay above about 3; textbook value, unverified here), which is why the reward pays min(q95/3, 1). In the PI rollout q95 falls from 15.6 at t = 1 s to 3.31 at 15 MA.
- **q_min**, the minimum of q, usually on or near the axis. Where q < 1 the core is unstable to an internal kink that produces **sawteeth**: periodic crashes that flatten the central temperature and current every few seconds and can seed more dangerous modes (textbook description, unverified here). The reward pays min(q_min, 1).

The agent never sets q directly. q95 follows I_p almost immediately (the edge current is the boundary condition), but q_min follows the *current profile*, which arrives in the core only by diffusion over tens of seconds. That lag is the subject of [How the current gets in](3-current-diffusion.md).

<figure markdown="span">
  ![Current density and q profiles of the PI episode](../figures/profiles.png)
  <figcaption><strong>TORAX profiles of the PI episode at six times.</strong> Left: the current density fills in from the edge and peaks on axis as the ramp proceeds. Right: q on axis crosses 1 between 40 and 60 s and ends at 0.41. Source: <code>data/trajectories/profiles.npz</code>.</figcaption>
</figure>

!!! tip "What it means for the agent"

    - **q95 is almost an action**: it is roughly 50/I_p[MA] for this machine (3.3 at 15 MA). The reward's q95 term is saturated whenever q95 ≥ 3, which holds everywhere in the action range (q95 ≥ 3.2 even at the 15 MA ceiling): the term pays the same for every policy.
    - **q_min is a slow state**: it responds to what you did 20–60 s ago. Keeping q_min ≥ 1 means managing current penetration (ramp rate and heating timing), not reacting to q_min.
    - **The reward is lenient about q < 1.** min(q_min, 1)/150 loses at most 1/150 per second; the whole q_min term is worth at most 1.0 per episode. In the simulator, nothing else happens at q < 1 because no sawtooth model is enabled (the Lab has one you can switch on).

[Open the Lab with q colouring at the moment PI's q_min crosses 1](7-lab.md?preset=pi&t=51&color=q&tab=q){ .rt-try } [PI at 80 s with the sawtooth model on](7-lab.md?preset=pi&t=80&color=q&tab=q&sawtooth=1){ .rt-try }

??? question "Check yourself"

    1. Doubling I_p at fixed profile shape does what to q everywhere? *Halves it.*
    2. Why is q on axis set by j(0) and not by I_p? *Near the axis, I(r) ≈ π r² j(0) (times elongation), so q(0) ≈ 2B/(μ₀ R j(0)) up to geometry: only the local current density matters.*
    3. The PI controller tracks a rising target for j(0). What does that do to q(0)? *Drives it down, through 1 at about 51 s, to 0.41 at the end.*
