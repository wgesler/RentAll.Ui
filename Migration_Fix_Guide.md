# Migration Fix Guide

## Key Issues and Fixes

### 1. IDENTITY_INSERT Pattern

For tables with identity columns (Office, Area, Region, Building, Color, ChartOfAccounts), wrap INSERT statements:

```sql
-- WRONG (causes error):
INSERT INTO Organization.Office VALUES (1, 'Office Name', ...);

-- CORRECT:
SET IDENTITY_INSERT Organization.Office ON;
INSERT INTO Organization.Office (OfficeId, OfficeName, ...) VALUES (1, 'Office Name', ...);
SET IDENTITY_INSERT Organization.Office OFF;
```

### 2. Correct Migration Order

Migrate data in this order to satisfy foreign key constraints:

#### Phase 1: Independent Tables (No Dependencies)
- User.RoleType
- Organization.EntityType
- Organization.State
- Property.PropertyType
- Property.PropertyStatus
- Property.PropertyStyle
- Property.ReservationType
- Property.ReservationStatus
- Property.ReservationNotice
- Property.DocumentType
- Property.BedSize
- Property.BillingType
- Property.DepositType
- Property.CheckInTime
- Property.CheckOutTime
- Property.Frequency
- Property.TrashDays
- Accounting.AccountType
- Accounting.TransactionType

#### Phase 2: Foundation Tables
- Organization.Organization

#### Phase 3: Office (Identity Column)
```sql
SET IDENTITY_INSERT Organization.Office ON;
INSERT INTO Organization.Office (OfficeId, OrganizationId, OfficeName, ...) 
SELECT OfficeId, OrganizationId, OfficeName, ... FROM dbo.Office;
SET IDENTITY_INSERT Organization.Office OFF;
```

#### Phase 4: Code Sequences
- Organization.CodeSequence

#### Phase 5: Users
- User.User (depends on Organization)

#### Phase 6: Organization Tables with Identity Columns
```sql
-- Area
SET IDENTITY_INSERT Organization.Area ON;
INSERT INTO Organization.Area (AreaId, OfficeId, AreaName, ...) 
SELECT AreaId, OfficeId, AreaName, ... FROM dbo.Area;
SET IDENTITY_INSERT Organization.Area OFF;

-- Region
SET IDENTITY_INSERT Organization.Region ON;
INSERT INTO Organization.Region (RegionId, OfficeId, RegionName, ...) 
SELECT RegionId, OfficeId, RegionName, ... FROM dbo.Region;
SET IDENTITY_INSERT Organization.Region OFF;

-- Building
SET IDENTITY_INSERT Organization.Building ON;
INSERT INTO Organization.Building (BuildingId, OfficeId, BuildingName, ...) 
SELECT BuildingId, OfficeId, BuildingName, ... FROM dbo.Building;
SET IDENTITY_INSERT Organization.Building OFF;

-- Color
SET IDENTITY_INSERT Organization.Color ON;
INSERT INTO Organization.Color (ColorId, OfficeId, ColorName, ...) 
SELECT ColorId, OfficeId, ColorName, ... FROM dbo.Color;
SET IDENTITY_INSERT Organization.Color OFF;
```

#### Phase 7: Organization Tables Dependent on Office
- Organization.Agent
- Organization.Contact
- Organization.Company
- Organization.Vendor

#### Phase 8: Property Tables
- Property.Property (depends on Contact for Owner1, Office, etc.)
- Property.PropertyInformation (depends on Property)
- Property.PropertyHtml (depends on Property)
- Property.Reservation (depends on Property, Contact, Office)
- Property.LeaseInformation (depends on Property)
- Property.Document (depends on Office)

#### Phase 9: User-Dependent Tables
- User.RefreshToken (depends on User)
- Property.PropertySelection (depends on User)

#### Phase 10: Accounting Tables
```sql
-- ChartOfAccounts (Identity Column)
SET IDENTITY_INSERT Accounting.ChartOfAccounts ON;
INSERT INTO Accounting.ChartOfAccounts (ChartOfAccountsId, AccountCode, ...) 
SELECT ChartOfAccountsId, AccountCode, ... FROM dbo.ChartOfAccounts;
SET IDENTITY_INSERT Accounting.ChartOfAccounts OFF;

-- Invoice (depends on Organization, Office, Reservation)
INSERT INTO Accounting.Invoice (InvoiceId, OrganizationId, OfficeId, ReservationId, ...) 
SELECT InvoiceId, OrganizationId, OfficeId, ReservationId, ... FROM dbo.Invoice;

-- LedgerLine (depends on Invoice)
INSERT INTO Accounting.LedgerLine (LedgerLineId, InvoiceId, ...) 
SELECT LedgerLineId, InvoiceId, ... FROM dbo.LedgerLine;

-- InvoiceLedgerLine (junction table)
INSERT INTO Accounting.InvoiceLedgerLine (InvoiceId, LedgerLineId, ...) 
SELECT InvoiceId, LedgerLineId, ... FROM dbo.InvoiceLedgerLine;
```

## Example Fix for Office Migration

```sql
-- Before (causes error):
INSERT INTO Organization.Office 
SELECT * FROM dbo.Office;

-- After (correct):
SET IDENTITY_INSERT Organization.Office ON;
INSERT INTO Organization.Office (
    OfficeId,
    OrganizationId,
    OfficeName,
    -- ... all other columns explicitly listed
)
SELECT 
    OfficeId,
    OrganizationId,
    OfficeName,
    -- ... all other columns
FROM dbo.Office;
SET IDENTITY_INSERT Organization.Office OFF;
```

## Important Notes

1. **Always list columns explicitly** when using IDENTITY_INSERT
2. **Turn IDENTITY_INSERT OFF** immediately after the INSERT
3. **Check foreign key dependencies** - parent tables must be migrated before child tables
4. **Use transactions** to ensure atomicity:
   ```sql
   BEGIN TRANSACTION;
   BEGIN TRY
       -- Your migration code
       COMMIT TRANSACTION;
   END TRY
   BEGIN CATCH
       ROLLBACK TRANSACTION;
       THROW;
   END CATCH
   ```
