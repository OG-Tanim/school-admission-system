using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AdmissionClass> Classes => Set<AdmissionClass>();
    public DbSet<SeatHold> Holds => Set<SeatHold>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AdmissionClass>(entity =>
        {
            entity.ToTable("classes");
            entity.Property(x => x.Name).HasMaxLength(200).IsRequired();
        });

        modelBuilder.Entity<SeatHold>(entity =>
        {
            entity.ToTable("holds");
            entity.Property(x => x.StudentId).HasMaxLength(32).IsRequired();
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            entity.HasIndex(x => x.StudentId);
            entity.HasOne(x => x.AdmissionClass)
                .WithMany(x => x.Holds)
                .HasForeignKey(x => x.ClassId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
