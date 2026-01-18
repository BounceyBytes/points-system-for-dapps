# Contributing to Points System V1

Thank you for your interest in contributing to the Fluxtra Points System!

## Code of Conduct

This project strictly follows the PRD (Product Requirements Document). All contributions must align with the V1 specification.

## Before You Contribute

**READ THE PRD FIRST**: All contributions must comply with the [PRD specification](DESIGN.md).

### V1 Scope (Allowed)
- Bug fixes
- Performance improvements
- Documentation improvements
- Test coverage improvements
- Security fixes
- Database optimization
- Error handling improvements

### Out of Scope (NOT Allowed in V1)
- Referrals
- Social tasks
- Team competitions
- Lotteries
- Real-time updates
- Multipliers or bonuses
- UI components

**Any PR introducing out-of-scope features will be rejected.**

## Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/points-system-for-dapps.git
   cd points-system-for-dapps
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Set up environment:
   ```bash
   cp .env.example .env
   ```
5. Start database:
   ```bash
   docker-compose up -d postgres
   ```
6. Run migrations:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
7. Start development server:
   ```bash
   npm run dev:watch
   ```

## Making Changes

### Branch Naming

- Feature: `feature/description`
- Bug fix: `fix/description`
- Docs: `docs/description`

### Commit Messages

Follow conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `test`: Tests
- `refactor`: Code refactor
- `perf`: Performance improvement
- `chore`: Maintenance

**Examples:**
```
fix(snapshot): handle missing balances correctly
docs(readme): add API examples
test(calculator): add unit tests for edge cases
```

## Testing

All changes must include tests.

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

**Minimum coverage:** 80%

## Code Style

This project uses ESLint and Prettier.

```bash
# Lint
npm run lint

# Format
npm run format

# Type check
npm run type-check
```

**All code must:**
- Pass linting (no warnings)
- Be formatted with Prettier
- Pass TypeScript strict mode
- Have no TypeScript errors

## Pull Request Process

1. **Create an issue first** describing the problem/improvement
2. Fork the repo and create a branch
3. Make your changes following the guidelines above
4. Write/update tests
5. Ensure all tests pass: `npm test`
6. Ensure linting passes: `npm run lint`
7. Update documentation if needed
8. Submit a PR with:
   - Clear description of changes
   - Link to related issue
   - Screenshots (if applicable)
   - Test results

### PR Review Checklist

Your PR will be reviewed against this checklist:

**Scope Guardrails**
- [ ] No V2/V3 features present
- [ ] No referrals, social, teams, lotteries
- [ ] No UI assumptions

**Economic Correctness**
- [ ] Emission rates are explicit constants
- [ ] No unbounded multipliers
- [ ] No compounding
- [ ] Daily emissions are calculable

**Determinism**
- [ ] No use of current time in calculations
- [ ] No randomness
- [ ] No external mutable state

**Snapshot Integrity**
- [ ] Fixed cadence maintained
- [ ] Immutable snapshots enforced
- [ ] Explicit failure on missing data

**Ledger Safety**
- [ ] Append-only enforced
- [ ] No retroactive mutation
- [ ] Replayable from genesis

**Testing**
- [ ] All tests pass
- [ ] Coverage >= 80%
- [ ] Edge cases covered

**Code Quality**
- [ ] No linting errors
- [ ] Properly formatted
- [ ] No TypeScript errors
- [ ] Clear variable/function names

**Documentation**
- [ ] README updated (if needed)
- [ ] Code comments for complex logic
- [ ] JSDoc for public APIs

## Questions?

- Open an issue for discussion
- Review existing issues/PRs
- Check the [DESIGN.md](DESIGN.md) for architecture details

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
