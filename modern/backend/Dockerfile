FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY nuget.config ./
COPY src/JourneyOS.Api/JourneyOS.Api.csproj src/JourneyOS.Api/
RUN dotnet restore src/JourneyOS.Api/JourneyOS.Api.csproj
COPY src/ src/
RUN dotnet publish src/JourneyOS.Api/JourneyOS.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
USER $APP_UID
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "JourneyOS.Api.dll"]
