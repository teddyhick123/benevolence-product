# Tax Feature Future Enhancements

**Last Updated**: December 3, 2025
**Status**: Planned enhancements for future sprints

This document outlines planned enhancements to the tax tracking system based on analysis of sophisticated donor needs and impact investing use cases.

---

## 🎯 Priority 1: High-Value Asset Types (Next Sprint)

### 1. Private Equity / Venture Capital Investments
**Why**: Common in impact investing portfolios, requires special handling

**Tax Considerations**:
- Requires qualified appraisal (vs public stock FMV)
- Holding period requirements for long-term capital gains treatment
- May trigger UBIT (Unrelated Business Income Tax)
- Transfer restrictions affect valuation

**Implementation**:
- Add `private_equity_investment` and `venture_capital_investment` asset types
- Enhanced appraisal tracking
- UBIT warning system

### 2. Real Estate Donations
**Why**: Major tax planning vehicle, significant deduction opportunities

**Tax Benefits**:
- Deduct FMV, avoid capital gains on appreciated property
- Conservation easements (enhanced deductions)
- Partial interest donations

**Requirements**:
- Qualified appraisal for donations >$5,000
- 30% AGI limit (vs 60% for cash)
- 5-year carryforward period

**Implementation**:
- Add `real_estate_donation` asset type
- Enhanced appraisal tracking fields
- Conservation easement support

### 3. Enhanced Appraisal Tracking
**Why**: Required for compliance on non-cash donations >$5k

**New Fields**:
- `appraisal_date` - Date of qualified appraisal
- `appraised_value` - Appraiser's FMV determination
- `appraiser_name` & `appraiser_tin` - Appraiser credentials
- `appraisal_storage_path` - Link to appraisal document

---

## 🎯 Priority 2: Specialized Giving Vehicles (1-2 months)

### 4. Impact Bonds
**Types**: Social Impact Bonds, Green Bonds, Development Impact Bonds

**Tax Treatment**: Similar to regular bonds with potential state/local incentives

**Implementation**: Add `impact_bond` asset type

### 5. Conservation Investments
**Examples**: Forest carbon credits, wetland banking, habitat restoration

**Tax Benefits**: Enhanced deductions for conservation easements

**Implementation**: Add `conservation_investment` asset type

### 6. AGI Limit & Carryforward Tracking
**Why**: Critical for proper deduction planning on large donations

**New Fields**:
- `agi_limit_percentage` - 30%, 50%, or 60% depending on asset type
- `carryforward_eligible` - Boolean flag
- `carryforward_years` - 5 for most property, up to 15 for conservation
- `carryforward_remaining` - Track unused deductions

**Auto-calculations**:
- Compare donation to AGI limits
- Calculate carryforward amounts
- Track multi-year carryforward usage

---

## 🎯 Priority 3: Advanced Giving Structures (3-6 months)

### 7. DAF Contributions (vs DAF Grants)
**Current**: Track DAF grants (money going out)
**Missing**: DAF contributions (money going in from donor)

**Tax Timing**: Immediate deduction when contributed to DAF, even if not yet granted

**Implementation**: Add `daf_contribution` asset type

### 8. Endowment Contributions
**Different from grants**: Permanent restricted funds

**Tax Treatment**: Same as donations but with perpetual restriction tracking

**Implementation**: Add `endowment_contribution` asset type

### 9. Pledge Commitments
**Use Case**: Multi-year pledges common in major giving

**Tax Timing**: Generally deductible when paid, not when pledged

**Tracking Need**: Show pledged vs paid amounts by year

**Implementation**: Add `pledge_commitment` asset type with payment tracking

### 10. UBIT Warning System
**Why**: Alert when investments may trigger Unrelated Business Income Tax

**Flags**:
- Partnership interests (K-1 income)
- Debt-financed property
- Business operations unrelated to charitable mission

---

## 🎯 Priority 4: Specialized Assets (6-12 months)

### 11. Artwork & Collectibles
**Tax Complexity**:
- Related-use rule (must relate to charity's mission for full deduction)
- Qualified appraisal required
- 28% max capital gains rate (higher than stocks)

### 12. Life Insurance Policies
**Donation Types**:
- Transfer ownership to charity
- Name charity as beneficiary

**Tax Benefits**: Deduct cash surrender value or premiums paid

### 13. Business Interests
**Types**: S-corp, LLC, partnership interests

**Tax Issues**:
- May trigger UBIT for charity
- Complex valuation
- Transfer restrictions

### 14. Intellectual Property
**Examples**: Patents, copyrights, royalty streams

**Special Rules**: Can deduct royalties over time (not just initial FMV)

### 15. Charitable Trusts (CRT/CLT)
**CRT**: Income to donor, remainder to charity (split-interest giving)
**CLT**: Income to charity, remainder to heirs (estate planning)

**Tax Benefits**: Partial immediate deduction, capital gains/estate tax avoidance

---

## 📊 Enhanced Tax Fields (All Priorities)

### Appraisal Tracking
```sql
ALTER TABLE tax_contributions ADD COLUMN appraisal_date DATE;
ALTER TABLE tax_contributions ADD COLUMN appraised_value NUMERIC;
ALTER TABLE tax_contributions ADD COLUMN appraiser_name TEXT;
ALTER TABLE tax_contributions ADD COLUMN appraiser_tin TEXT;
ALTER TABLE tax_contributions ADD COLUMN appraisal_storage_path TEXT;
```

### AGI Limits & Carryforwards
```sql
ALTER TABLE tax_contributions ADD COLUMN agi_limit_percentage NUMERIC;
ALTER TABLE tax_contributions ADD COLUMN carryforward_eligible BOOLEAN DEFAULT false;
ALTER TABLE tax_contributions ADD COLUMN carryforward_years INTEGER;
ALTER TABLE tax_contributions ADD COLUMN carryforward_remaining NUMERIC;
```

### Compliance Tracking
```sql
ALTER TABLE tax_contributions ADD COLUMN related_use_qualified BOOLEAN;
ALTER TABLE tax_contributions ADD COLUMN ubit_concerns TEXT;
ALTER TABLE tax_contributions ADD COLUMN holding_period_days INTEGER;
```

---

## 🎯 Strategic Recommendation

**Start with the "Big 3" covering 80% of sophisticated donor use cases:**

1. ✅ **Private Equity/VC tracking** - Essential for impact investors
2. ✅ **Real Estate donations** - Major tax planning tool
3. ✅ **Enhanced appraisal & carryforward tracking** - Critical compliance

This positions the platform as the go-to tool for sophisticated impact investors who need proper tax tracking beyond basic cash donations.

---

## 💡 Auto-Population Intelligence

Future feature: Smart defaults based on asset type

```typescript
export function getAssetTaxMetadata(assetType: AssetType) {
  switch (assetType) {
    case 'private_equity_investment':
      return {
        requires_appraisal: true,
        appraisal_threshold: 10000,
        agi_limit: 0.30,
        carryforward_years: 5,
        potential_ubit: true,
        suggested_holding_length: '1+ years for LTCG treatment',
      };

    case 'real_estate_donation':
      return {
        requires_appraisal: true,
        appraisal_threshold: 5000,
        agi_limit: 0.30,
        carryforward_years: 5,
        special_rules: 'Conservation easements may qualify for 50% AGI limit',
      };
  }
}
```

---

## 📋 Implementation Timeline

### Immediate (Current Sprint)
- [x] QCD tracking (✅ COMPLETE)
- [x] Enhanced requires_appraisal handling (✅ COMPLETE)
- [ ] Private equity asset type
- [ ] Real estate donation asset type
- [ ] Enhanced appraisal tracking fields

### Short-term (1-2 months)
- [ ] Impact bonds
- [ ] Conservation investments
- [ ] AGI limit tracking
- [ ] Carryforward calculations
- [ ] UBIT warning system

### Medium-term (3-6 months)
- [ ] DAF contribution tracking
- [ ] Endowment contributions
- [ ] Pledge commitments
- [ ] Related-use tracking (artwork)

### Long-term (6-12 months)
- [ ] Charitable trust structures (CRT/CLT)
- [ ] Life insurance donations
- [ ] Business interest donations
- [ ] Intellectual property donations
- [ ] Full tax scenario modeling

---

## 🎯 Key Benefits

### For Users
- **Better tax planning**: Accurate deduction calculations
- **Compliance**: Proper appraisal and documentation tracking
- **Optimization**: Identify best donation strategies
- **Risk management**: UBIT and other tax trap warnings

### For the Platform
- **Differentiation**: Most comprehensive impact investment tax tracking
- **Trust**: Professional-grade tax compliance features
- **Upsell**: Advanced features for family offices and foundations
- **Data**: Rich dataset for tax optimization AI features

---

## Reference

**Original Analysis**: `docs/archive/TAX_ENHANCEMENT_ANALYSIS.md`
**Current Implementation**: `TAX_FEATURE_README.md`
**Active Tracking**: `PROGRESS_SUMMARY.md`
