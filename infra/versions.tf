terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.71"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.8"
    }
  }
}

# Credenciales: AWS_PROFILE (por ejemplo eventos-u), nunca en el código.
provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      Project = "eventos-u"
      Course  = "sistemas-distribuidos"
    }
  }
}
