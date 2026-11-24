using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace JourneyOS.Api.Persistence;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<GdsDbContext>
{
    public GdsDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<GdsDbContext>()
            .UseNpgsql("Host=localhost;Database=design_only").Options, new TenantContext());
}
