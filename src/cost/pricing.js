const prices = require('./aws-prices.json');

const HOURS_PER_MONTH = 730;

const USAGE_BASED_TYPES = new Set([
  'aws_s3_bucket',
  'aws_s3_bucket_lifecycle_configuration',
  'aws_s3_bucket_versioning',
  'aws_s3_bucket_public_access_block',
  'aws_s3_bucket_server_side_encryption_configuration',
  'aws_s3_bucket_website_configuration',
  'aws_s3_bucket_policy',
  'aws_s3_bucket_cors_configuration',
  'aws_sqs_queue',
  'aws_sns_topic',
  'aws_lambda_function',
  'aws_lambda_permission',
  'aws_dynamodb_table',
  'aws_cloudwatch_log_group',
  'aws_cloudwatch_metric_alarm',
  'aws_api_gateway_rest_api',
  'aws_apigatewayv2_api',
  'aws_cloudfront_distribution',
  'aws_ses_domain_identity',
  'aws_kinesis_stream',
  'aws_kinesis_firehose_delivery_stream',
]);

const FREE_TYPES = new Set([
  'aws_iam_role',
  'aws_iam_policy',
  'aws_iam_role_policy_attachment',
  'aws_iam_policy_attachment',
  'aws_iam_instance_profile',
  'aws_iam_user',
  'aws_iam_group',
  'aws_security_group',
  'aws_security_group_rule',
  'aws_vpc',
  'aws_subnet',
  'aws_internet_gateway',
  'aws_route_table',
  'aws_route_table_association',
  'aws_route',
  'aws_route53_zone',
  'aws_route53_record',
  'aws_acm_certificate',
  'aws_acm_certificate_validation',
  'aws_ecr_repository',
  'aws_ecr_lifecycle_policy',
  'aws_secretsmanager_secret',
  'aws_ssm_parameter',
  'aws_kms_key',
  'aws_kms_alias',
  'aws_cloudwatch_log_subscription_filter',
  'aws_lb_target_group',
  'aws_lb_listener',
  'aws_lb_listener_rule',
  'aws_lb_target_group_attachment',
  'aws_cognito_user_pool',
  'aws_cognito_user_pool_client',
  'aws_sfn_state_machine',
]);

function getRegionMultiplier(region) {
  return prices.regional_multipliers[region] || 1.0;
}

function estimateEC2(resource, region) {
  const instanceType = resource.after?.instance_type;
  if (!instanceType) return null;

  const hourly = prices.ec2[instanceType];
  if (!hourly) return null;

  return hourly * HOURS_PER_MONTH * getRegionMultiplier(region);
}

function estimateRDS(resource, region) {
  const instanceClass = resource.after?.instance_class;
  const engine = resource.after?.engine;
  const multiAz = resource.after?.multi_az;

  if (!instanceClass) return null;

  // Try engine-specific pricing first, then fall back to postgres pricing
  const enginePrices = prices.rds[engine] || prices.rds['postgres'] || {};
  const hourly = enginePrices[instanceClass];
  if (!hourly) return null;

  let monthly = hourly * HOURS_PER_MONTH * getRegionMultiplier(region);
  if (multiAz) monthly *= 2;

  // Add storage cost if allocated_storage is specified
  const storage = resource.after?.allocated_storage;
  if (storage && prices.ebs) {
    const storageType = resource.after?.storage_type || 'gp3';
    const storagePrice = prices.ebs[storageType] || prices.ebs['gp3'];
    if (storagePrice) {
      monthly += storage * storagePrice * getRegionMultiplier(region);
    }
  }

  return monthly;
}

function estimateALB(resource, region) {
  const lbType = resource.after?.load_balancer_type || 'application';
  const key = lbType === 'network' ? 'nlb' : 'alb';
  const hourly = prices[key]?.hourly;
  if (!hourly) return null;
  return hourly * HOURS_PER_MONTH * getRegionMultiplier(region);
}

function estimateNATGateway(resource, region) {
  const hourly = prices.nat_gateway?.hourly;
  if (!hourly) return null;
  return hourly * HOURS_PER_MONTH * getRegionMultiplier(region);
}

function estimateEBS(resource, region) {
  const volumeType = resource.after?.type || 'gp3';
  const size = resource.after?.size || 20;
  const pricePerGB = prices.ebs?.[volumeType];
  if (!pricePerGB) return null;
  return size * pricePerGB * getRegionMultiplier(region);
}

function estimateElastiCache(resource, region) {
  const nodeType = resource.after?.node_type;
  if (!nodeType) return null;
  const hourly = prices.elasticache?.[nodeType];
  if (!hourly) return null;
  const numNodes = resource.after?.num_cache_nodes || 1;
  return hourly * HOURS_PER_MONTH * numNodes * getRegionMultiplier(region);
}

function estimateElasticIP(resource, region) {
  const monthly = prices.elastic_ip?.monthly;
  if (!monthly) return null;
  return monthly * getRegionMultiplier(region);
}

const ESTIMATORS = {
  'aws_instance': estimateEC2,
  'aws_db_instance': estimateRDS,
  'aws_lb': estimateALB,
  'aws_alb': estimateALB,
  'aws_nat_gateway': estimateNATGateway,
  'aws_ebs_volume': estimateEBS,
  'aws_elasticache_cluster': estimateElastiCache,
  'aws_elasticache_replication_group': estimateElastiCache,
  'aws_eip': estimateElasticIP,
};

function estimateCosts(resources, region) {
  const multiplier = getRegionMultiplier(region);

  for (const r of resources) {
    if (FREE_TYPES.has(r.type)) {
      r.costType = 'free';
      continue;
    }

    if (USAGE_BASED_TYPES.has(r.type)) {
      r.costType = 'usage-based';
      continue;
    }

    const estimator = ESTIMATORS[r.type];
    if (estimator) {
      const cost = estimator(r, region);
      if (cost !== null) {
        r.monthlyCost = Math.round(cost * 100) / 100;
        r.costType = 'fixed';
      }
    }
  }
}

module.exports = { estimateCosts };
