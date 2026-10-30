pipeline {
  agent any

  stages {
    stage('Deploy Creative Hub Pro') {
      steps {
        withCredentials([file(credentialsId: 'creativehub_pro_env', variable: 'ENV_PRODUCTION_FILE')]) {
          sh '''
            ENV_FILE="$ENV_PRODUCTION_FILE" docker compose build creative-hub-prod
            ENV_FILE="$ENV_PRODUCTION_FILE" docker compose run --rm creative-hub-prod sh -c "npx prisma migrate deploy"
            ENV_FILE="$ENV_PRODUCTION_FILE" docker compose up -d --force-recreate --remove-orphans
            ENV_FILE="$ENV_PRODUCTION_FILE" docker compose ps
            ENV_FILE="$ENV_PRODUCTION_FILE" docker compose logs --tail=120 creative-hub-prod
          '''
        }
      }
    }
  }
}
